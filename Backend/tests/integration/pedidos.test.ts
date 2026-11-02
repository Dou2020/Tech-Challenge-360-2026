import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo } from '../helpers/auth.js';
import {
  agregarAlCarrito,
  comprar,
  crearCupon,
  crearVariante,
  iniciarCheckout,
  metodoEnvio,
  nuevoCliente,
  type Http,
} from '../helpers/pedidos.js';

/*
 * Pedidos y ciclo de vida (RF-01, RF-02, RF-07). Cada prueba compra con variantes y clientes
 * propios: no depende de las existencias ni de los pedidos de la semilla.
 */

const app = createApp();
let admin: Http;
let operador: Http;
let idMetodoEnvio: number;

interface Linea {
  idPedidoDetalle: number;
  idVariante: number;
  cantidad: number;
  precioUnitario: string;
  cantidadDevuelta: number;
  cantidadDevolvible: number;
}
interface Detalle {
  idPedido: number;
  numeroPedido: string;
  estado: string;
  total: string;
  subtotal: string;
  descuento: string;
  cupon: { codigo: string } | null;
  lineas: Linea[];
  transiciones: { estado: string; via: string }[];
  pago: { estado: string };
}

async function detalle(http: Http, idPedido: number): Promise<Detalle> {
  const r = await http.get(`/api/pedidos/${idPedido}`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as Detalle;
}

async function avanzar(idPedido: number, ...estados: string[]): Promise<void> {
  for (const estado of estados) {
    const r = await operador.patch(`/api/pedidos/${idPedido}/estado`).send({ estado });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
}

async function existencia(sku: string) {
  const r = await admin.get('/api/inventario/existencias').query({ q: sku });
  return (
    r.body.items as { sku: string; existenciaFisica: number; existenciaReservada: number }[]
  ).find((e) => e.sku === sku)!;
}

beforeAll(async () => {
  await connectRedis();
  ({ http: admin } = await clienteComo(app, 'admin'));
  ({ http: operador } = await clienteComo(app, 'operador'));
  idMetodoEnvio = await metodoEnvio(app);
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

describe('Acceso y propiedad (RF-01)', () => {
  it('iniciar el checkout con la dirección de otro cliente → 404', async () => {
    // Arrange
    const variante = await crearVariante(admin, 3);
    const [a, b] = await Promise.all([nuevoCliente(app), nuevoCliente(app)]);
    await agregarAlCarrito(a.http, variante.idVariante);

    // Act
    const respuesta = await a.http
      .post('/api/checkout/iniciar')
      .send({ idDireccion: b.idDireccion, idMetodoEnvio });

    // Assert
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });

  it('ver, cancelar, consultar el historial y las devoluciones del pedido de otro cliente → 404', async () => {
    // Arrange
    const variante = await crearVariante(admin, 3);
    const [dueno, intruso] = await Promise.all([nuevoCliente(app), nuevoCliente(app)]);
    const idPedido = await comprar(dueno, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 1 },
    ]);

    // Act
    const ver = await intruso.http.get(`/api/pedidos/${idPedido}`);
    const cancelar = await intruso.http.post(`/api/pedidos/${idPedido}/cancelar`).send({});
    const historial = await intruso.http.get(`/api/pedidos/${idPedido}/historial`);
    const devoluciones = await intruso.http.get(`/api/pedidos/${idPedido}/devoluciones`);

    // Assert
    for (const r of [ver, cancelar, historial, devoluciones]) {
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe('NO_ENCONTRADO');
    }
    expect((await detalle(dueno.http, idPedido)).estado).toBe('PAGADO');
  });

  it('el listado del cliente solo trae los suyos; el personal ve todos', async () => {
    // Arrange
    const variante = await crearVariante(admin, 4);
    const [a, b] = await Promise.all([nuevoCliente(app), nuevoCliente(app)]);
    const idA = await comprar(a, idMetodoEnvio, [{ idVariante: variante.idVariante, cantidad: 1 }]);
    const idB = await comprar(b, idMetodoEnvio, [{ idVariante: variante.idVariante, cantidad: 1 }]);

    // Act: el cliente intenta ver los de otro con idCliente
    const propios = await a.http.get('/api/pedidos').query({ idCliente: b.idUsuario });
    const personal = await operador.get('/api/pedidos').query({ idCliente: b.idUsuario });

    // Assert
    expect((propios.body.items as { idPedido: number }[]).map((p) => p.idPedido)).toEqual([idA]);
    expect((personal.body.items as { idPedido: number }[]).map((p) => p.idPedido)).toEqual([idB]);
    expect(propios.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
  });

  it('roles: sin token 401; cliente no cambia estado ni registra devoluciones (403)', async () => {
    // Arrange
    const cliente = await nuevoCliente(app);

    // Act
    const sinToken = await request(app).get('/api/pedidos');
    const estado = await cliente.http.patch('/api/pedidos/1/estado').send({ estado: 'ENTREGADO' });
    const devolucion = await cliente.http
      .post('/api/pedidos/1/devoluciones')
      .send({ motivo: 'x', lineas: [{ idPedidoDetalle: 1, cantidad: 1 }] });
    const pago = await operador
      .post('/api/checkout/iniciar')
      .send({ idDireccion: 1, idMetodoEnvio });
    const estados = await request(app).get('/api/pedidos/estados');

    // Assert
    expect(sinToken.status).toBe(401);
    expect(estado.status).toBe(403);
    expect(devolucion.status).toBe(403);
    expect(pago.status).toBe(403);
    expect(estados.status).toBe(401);
  });

  it('GET /api/pedidos/estados lo ve cualquier usuario autenticado', async () => {
    // Arrange
    const cliente = await nuevoCliente(app);

    // Act
    const r = await cliente.http.get('/api/pedidos/estados');

    // Assert
    expect(r.status).toBe(200);
    expect((r.body.estados as { codigo: string }[]).map((e) => e.codigo)).toEqual(
      expect.arrayContaining(['PAGADO', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'CANCELADO']),
    );
    expect(r.body.transiciones.length).toBeGreaterThan(0);
  });
});

describe('Precios congelados (RF-02)', () => {
  it('cambiar el precio de la variante después de pagar no altera el pedido', async () => {
    // Arrange
    const variante = await crearVariante(admin, 5, '100.00');
    const cliente = await nuevoCliente(app);
    const idPedido = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 2 },
    ]);
    const antes = await detalle(cliente.http, idPedido);

    // Act
    const cambio = await admin
      .patch(`/api/variantes/${variante.idVariante}/precio`)
      .send({ precio: '999.00' });
    const despues = await detalle(cliente.http, idPedido);

    // Assert
    expect(cambio.status).toBe(200);
    expect(antes.lineas[0]).toMatchObject({ precioUnitario: '100.00', cantidad: 2 });
    expect(antes.subtotal).toBe('200.00');
    expect(despues.lineas[0]!.precioUnitario).toBe('100.00');
    expect(despues.total).toBe(antes.total);
    expect(despues.subtotal).toBe('200.00');
  });
});

describe('Ciclo de vida (RF-07)', () => {
  it('PAGADO → ENTREGADO no está permitido: 409 TRANSICION_NO_PERMITIDA', async () => {
    // Arrange
    const variante = await crearVariante(admin, 3);
    const cliente = await nuevoCliente(app);
    const idPedido = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 1 },
    ]);

    // Act
    const salto = await operador
      .patch(`/api/pedidos/${idPedido}/estado`)
      .send({ estado: 'ENTREGADO' });
    const igual = await operador
      .patch(`/api/pedidos/${idPedido}/estado`)
      .send({ estado: 'PAGADO' });

    // Assert
    expect(salto.status).toBe(409);
    expect(salto.body.error.code).toBe('TRANSICION_NO_PERMITIDA');
    expect(igual.status).toBe(409);
    expect((await detalle(cliente.http, idPedido)).estado).toBe('PAGADO');
  });

  it('avanza PAGADO → EN_PREPARACION → DESPACHADO → ENTREGADO y deja el historial', async () => {
    // Arrange
    const variante = await crearVariante(admin, 3);
    const cliente = await nuevoCliente(app);
    const idPedido = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 1 },
    ]);

    // Act
    const respuesta = await operador
      .patch(`/api/pedidos/${idPedido}/estado`)
      .send({ estado: 'en_preparacion', comentario: 'Empacando' });
    await avanzar(idPedido, 'DESPACHADO', 'ENTREGADO');
    const historial = await cliente.http.get(`/api/pedidos/${idPedido}/historial`);

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ idPedido, estado: 'EN_PREPARACION' });
    expect(respuesta.body.transiciones).toEqual(
      expect.arrayContaining([expect.objectContaining({ via: 'CANCELAR' })]),
    );
    expect(
      (historial.body as { estadoNuevo: { codigo: string } }[]).map((h) => h.estadoNuevo.codigo),
    ).toEqual(['PAGADO', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO']);
    expect(historial.body[0].estadoAnterior).toBeNull();
    expect(historial.body[1].comentario).toBe('Empacando');
  });

  it('cancelar antes del despacho reintegra la existencia (kardex CANCELACION)', async () => {
    // Arrange
    const variante = await crearVariante(admin, 5);
    const cliente = await nuevoCliente(app);
    const idPedido = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 3 },
    ]);
    const vendida = await existencia(variante.sku);

    // Act
    const cancelado = await cliente.http
      .post(`/api/pedidos/${idPedido}/cancelar`)
      .send({ motivo: 'Me arrepentí' });
    const kardex = await admin.get(`/api/inventario/variantes/${variante.idVariante}/kardex`);

    // Assert
    expect(vendida.existenciaFisica).toBe(2);
    expect(cancelado.status, JSON.stringify(cancelado.body)).toBe(200);
    expect(cancelado.body).toMatchObject({ idPedido, estado: 'CANCELADO' });
    expect(cancelado.body.pago.estado).toBe('REEMBOLSADO');
    expect((await existencia(variante.sku)).existenciaFisica).toBe(5);
    expect(
      (
        kardex.body.items as { codigoTipoMovimiento: string; cantidad: number; idPedido: number }[]
      ).filter((m) => m.codigoTipoMovimiento === 'CANCELACION'),
    ).toEqual([expect.objectContaining({ cantidad: 3, idPedido })]);
  });

  it('cancelar libera el uso del cupón: el cliente puede volver a aplicarlo', async () => {
    // Arrange
    const variante = await crearVariante(admin, 5, '200.00');
    const cliente = await nuevoCliente(app);
    await agregarAlCarrito(cliente.http, variante.idVariante);
    const aplicado = await cliente.http.post('/api/carrito/cupon').send({ codigo: 'BIENVENIDA10' });
    expect(aplicado.status, JSON.stringify(aplicado.body)).toBe(200);
    expect((await iniciarCheckout(cliente, idMetodoEnvio)).status).toBe(200);
    const pago = await cliente.http
      .post('/api/checkout/pagar')
      .set('Idempotency-Key', randomUUID())
      .send({
        idDireccion: cliente.idDireccion,
        idMetodoEnvio,
        metodoPago: 'TARJETA',
        datosPago: { titular: 'Cliente', ultimos4: '4242' },
      });
    expect(pago.status, JSON.stringify(pago.body)).toBe(201);
    const idPedido = pago.body.idPedido as number;
    const conCupon = await detalle(cliente.http, idPedido);

    // Act
    const cancelado = await cliente.http.post(`/api/pedidos/${idPedido}/cancelar`).send({});
    await agregarAlCarrito(cliente.http, variante.idVariante);
    const reaplicado = await cliente.http
      .post('/api/carrito/cupon')
      .send({ codigo: 'BIENVENIDA10' });

    // Assert
    expect(conCupon.cupon).toMatchObject({ codigo: 'BIENVENIDA10' });
    expect(conCupon.descuento).toBe('20.00');
    expect(cancelado.status).toBe(200);
    expect(reaplicado.status, JSON.stringify(reaplicado.body)).toBe(200);
    expect(reaplicado.body.cupon).toMatchObject({ aplicado: true, codigoError: null });
  });

  it('cancelar un pedido despachado → 409; uno ya cancelado también', async () => {
    // Arrange
    const variante = await crearVariante(admin, 3);
    const cliente = await nuevoCliente(app);
    const despachado = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 1 },
    ]);
    await avanzar(despachado, 'EN_PREPARACION', 'DESPACHADO');
    const cancelable = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 1 },
    ]);
    await cliente.http.post(`/api/pedidos/${cancelable}/cancelar`).send({});

    // Act
    const tarde = await cliente.http.post(`/api/pedidos/${despachado}/cancelar`).send({});
    const repetida = await cliente.http.post(`/api/pedidos/${cancelable}/cancelar`).send({});

    // Assert
    expect(tarde.status).toBe(409);
    expect(tarde.body.error.code).toBe('TRANSICION_NO_PERMITIDA');
    expect(repetida.status).toBe(409);
    expect((await detalle(cliente.http, despachado)).estado).toBe('DESPACHADO');
  });

  it('PATCH /estado no sirve para cancelar ni para devolver (se usan sus endpoints)', async () => {
    // Arrange
    const variante = await crearVariante(admin, 3);
    const cliente = await nuevoCliente(app);
    const idPedido = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 1 },
    ]);

    // Act
    const cancelar = await operador
      .patch(`/api/pedidos/${idPedido}/estado`)
      .send({ estado: 'CANCELADO' });
    const devolver = await operador
      .patch(`/api/pedidos/${idPedido}/estado`)
      .send({ estado: 'DEVUELTO' });
    const vacio = await operador.patch(`/api/pedidos/${idPedido}/estado`).send({});

    // Assert
    expect(cancelar.status).toBe(409);
    expect(devolver.status).toBe(409);
    expect(vacio.status).toBe(400);
  });

  it('devoluciones: más de lo vendido → 422; línea de otro pedido → 400; parcial y luego total', async () => {
    // Arrange
    const variante = await crearVariante(admin, 10, '100.00');
    const cliente = await nuevoCliente(app);
    const idPedido = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 3 },
    ]);
    const otroPedido = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 1 },
    ]);
    const lineaAjena = (await detalle(cliente.http, otroPedido)).lineas[0]!.idPedidoDetalle;
    const linea = (await detalle(cliente.http, idPedido)).lineas[0]!.idPedidoDetalle;
    const devolver = (lineas: { idPedidoDetalle: number; cantidad: number }[]) =>
      operador.post(`/api/pedidos/${idPedido}/devoluciones`).send({ motivo: 'Defecto', lineas });
    const sinEntregar = await devolver([{ idPedidoDetalle: linea, cantidad: 1 }]);
    await avanzar(idPedido, 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO');

    // Act
    const exceso = await devolver([{ idPedidoDetalle: linea, cantidad: 4 }]);
    const ajena = await devolver([{ idPedidoDetalle: lineaAjena, cantidad: 1 }]);
    const repetida = await devolver([
      { idPedidoDetalle: linea, cantidad: 1 },
      { idPedidoDetalle: linea, cantidad: 1 },
    ]);
    const parcial = await devolver([{ idPedidoDetalle: linea, cantidad: 1 }]);
    const excesoAcumulado = await devolver([{ idPedidoDetalle: linea, cantidad: 3 }]);
    const total = await devolver([{ idPedidoDetalle: linea, cantidad: 2 }]);
    const lista = await cliente.http.get(`/api/pedidos/${idPedido}/devoluciones`);
    const final = await detalle(cliente.http, idPedido);
    const kardex = await admin.get(`/api/inventario/variantes/${variante.idVariante}/kardex`);

    // Assert
    expect(sinEntregar.status).toBe(409);
    expect(exceso.status).toBe(422);
    expect(exceso.body.error.code).toBe('CANTIDAD_DEVOLUCION_EXCEDIDA');
    expect(ajena.status).toBe(400);
    expect(ajena.body.error.code).toBe('VALIDACION');
    expect(repetida.status).toBe(400);
    expect(parcial.status, JSON.stringify(parcial.body)).toBe(201);
    expect(parcial.body).toMatchObject({
      tipo: 'PARCIAL',
      estadoPedido: 'DEVUELTO_PARCIAL',
      montoReembolso: '100.00',
    });
    expect(excesoAcumulado.status).toBe(422);
    expect(total.status, JSON.stringify(total.body)).toBe(201);
    expect(total.body).toMatchObject({ estadoPedido: 'DEVUELTO', montoReembolso: '200.00' });
    expect(lista.body).toHaveLength(2);
    expect(lista.body[0].lineas).toHaveLength(1);
    expect(final).toMatchObject({ estado: 'DEVUELTO', montoReembolsado: '300.00' });
    expect(final.lineas[0]).toMatchObject({ cantidadDevuelta: 3, cantidadDevolvible: 0 });
    expect(
      (kardex.body.items as { codigoTipoMovimiento: string }[]).filter(
        (m) => m.codigoTipoMovimiento === 'DEVOLUCION',
      ),
    ).toHaveLength(2);
  });

  it('el personal cancela cualquier pedido antes del despacho', async () => {
    // Arrange
    const variante = await crearVariante(admin, 3);
    const cliente = await nuevoCliente(app);
    const idPedido = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 1 },
    ]);

    // Act
    const respuesta = await operador
      .post(`/api/pedidos/${idPedido}/cancelar`)
      .send({ motivo: 'Fraude' });

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.estado).toBe('CANCELADO');
    expect((await existencia(variante.sku)).existenciaFisica).toBe(3);
  });
});

describe('Cupón y descuento en cancelaciones y devoluciones (RF-05, RF-07)', () => {
  it('cancelar un pedido con cupón y dos líneas deja un movimiento CANCELACION por línea y libera el uso', async () => {
    // Arrange
    const cupon = await crearCupon(admin);
    const [a, b] = await Promise.all([crearVariante(admin, 5), crearVariante(admin, 5)]);
    const comprador = await nuevoCliente(app);
    const idPedido = await comprar(
      comprador,
      idMetodoEnvio,
      [
        { idVariante: a.idVariante, cantidad: 2 },
        { idVariante: b.idVariante, cantidad: 1 },
      ],
      cupon.codigo,
    );
    const conUso = await admin.get(`/api/cupones/${cupon.idCupon}`);

    // Act
    const cancelado = await comprador.http.post(`/api/pedidos/${idPedido}/cancelar`).send({});

    // Assert
    expect(conUso.body.usosActuales).toBe(1);
    expect(cancelado.status, JSON.stringify(cancelado.body)).toBe(200);
    expect(cancelado.body.estado).toBe('CANCELADO');
    for (const [variante, cantidad] of [
      [a, 2],
      [b, 1],
    ] as const) {
      const kardex = await admin.get(`/api/inventario/variantes/${variante.idVariante}/kardex`);
      const cancelaciones = (
        kardex.body.items as { codigoTipoMovimiento: string; cantidad: number; idPedido: number }[]
      ).filter((m) => m.codigoTipoMovimiento === 'CANCELACION');
      expect(cancelaciones).toEqual([expect.objectContaining({ cantidad, idPedido })]);
      expect((await existencia(variante.sku)).existenciaFisica).toBe(5);
    }
    const sinUso = await admin.get(`/api/cupones/${cupon.idCupon}`);
    expect(sinUso.body.usosActuales).toBe(0);
    const usos = await admin.get(`/api/cupones/${cupon.idCupon}/usos`);
    expect(usos.body.total).toBe(0);
  });

  it('devolver línea por línea un pedido con descuento reembolsa en proporción y la suma es exacta', async () => {
    // Arrange
    const cupon = await crearCupon(admin, { valor: '15' });
    const a = await crearVariante(admin, 5, '33.33');
    const b = await crearVariante(admin, 5, '10.01');
    const comprador = await nuevoCliente(app);
    const idPedido = await comprar(
      comprador,
      idMetodoEnvio,
      [
        { idVariante: a.idVariante, cantidad: 3 },
        { idVariante: b.idVariante, cantidad: 1 },
      ],
      cupon.codigo,
    );
    await avanzar(idPedido, 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO');
    const pedido = await detalle(comprador.http, idPedido);
    const lineaA = pedido.lineas.find((l) => l.idVariante === a.idVariante)!;
    const lineaB = pedido.lineas.find((l) => l.idVariante === b.idVariante)!;
    const devolver = (idPedidoDetalle: number, cantidad: number) =>
      operador
        .post(`/api/pedidos/${idPedido}/devoluciones`)
        .send({ motivo: 'Defecto', lineas: [{ idPedidoDetalle, cantidad }] });

    // Act
    const respuestas = [
      await devolver(lineaA.idPedidoDetalle, 1),
      await devolver(lineaA.idPedidoDetalle, 1),
      await devolver(lineaA.idPedidoDetalle, 1),
      await devolver(lineaB.idPedidoDetalle, 1),
    ];

    // Assert
    for (const r of respuestas) expect(r.status, JSON.stringify(r.body)).toBe(201);
    const centavos = (monto: string) => Math.round(Number(monto) * 100);
    const reembolsos = respuestas.map((r) => centavos(r.body.montoReembolso as string));
    const neto = centavos(pedido.subtotal) - centavos(pedido.descuento);
    expect(centavos(pedido.descuento)).toBeGreaterThan(0);
    for (const monto of reembolsos) expect(monto).toBeLessThan(10_000);
    expect(reembolsos.reduce((suma, monto) => suma + monto, 0)).toBe(neto);
    const final = await detalle(comprador.http, idPedido);
    expect(final.estado).toBe('DEVUELTO');
    expect(centavos((final as unknown as { montoReembolsado: string }).montoReembolsado)).toBe(
      neto,
    );
  });

  it('una devolución parcial reembolsa el precio con el descuento aplicado, no el precio de lista', async () => {
    // Arrange
    const cupon = await crearCupon(admin, { valor: '10' });
    const variante = await crearVariante(admin, 5, '100.00');
    const comprador = await nuevoCliente(app);
    const idPedido = await comprar(
      comprador,
      idMetodoEnvio,
      [{ idVariante: variante.idVariante, cantidad: 2 }],
      cupon.codigo,
    );
    await avanzar(idPedido, 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO');
    const linea = (await detalle(comprador.http, idPedido)).lineas[0]!;

    // Act
    const respuesta = await operador
      .post(`/api/pedidos/${idPedido}/devoluciones`)
      .send({ motivo: 'Talla', lineas: [{ idPedidoDetalle: linea.idPedidoDetalle, cantidad: 1 }] });

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    expect(respuesta.body).toMatchObject({ tipo: 'PARCIAL', montoReembolso: '90.00' });
  });

  it('cancelar un pedido ENTREGADO → 409 TRANSICION_NO_PERMITIDA sin tocar existencia ni estado', async () => {
    // Arrange
    const variante = await crearVariante(admin, 4);
    const comprador = await nuevoCliente(app);
    const idPedido = await comprar(comprador, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 1 },
    ]);
    await avanzar(idPedido, 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO');

    // Act
    const respuesta = await operador.post(`/api/pedidos/${idPedido}/cancelar`).send({});

    // Assert
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('TRANSICION_NO_PERMITIDA');
    expect((await detalle(comprador.http, idPedido)).estado).toBe('ENTREGADO');
    expect((await existencia(variante.sku)).existenciaFisica).toBe(3);
  });

  it('cancelar un pedido con devolución parcial → 409: no se reintegra dos veces', async () => {
    // Arrange
    const variante = await crearVariante(admin, 4);
    const comprador = await nuevoCliente(app);
    const idPedido = await comprar(comprador, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 2 },
    ]);
    await avanzar(idPedido, 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO');
    const linea = (await detalle(comprador.http, idPedido)).lineas[0]!;
    const devolucion = await operador.post(`/api/pedidos/${idPedido}/devoluciones`).send({
      motivo: 'Defecto',
      lineas: [{ idPedidoDetalle: linea.idPedidoDetalle, cantidad: 1 }],
    });
    expect(devolucion.status, JSON.stringify(devolucion.body)).toBe(201);

    // Act
    const respuesta = await operador.post(`/api/pedidos/${idPedido}/cancelar`).send({});

    // Assert
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('TRANSICION_NO_PERMITIDA');
    expect((await detalle(comprador.http, idPedido)).estado).toBe('DEVUELTO_PARCIAL');
    expect((await existencia(variante.sku)).existenciaFisica).toBe(3);
  });
});

describe('Resumen y arranque del checkout', () => {
  it('GET /api/checkout con un idMetodoEnvio inexistente → 404 NO_ENCONTRADO', async () => {
    // Arrange
    const variante = await crearVariante(admin, 2);
    const comprador = await nuevoCliente(app);
    await agregarAlCarrito(comprador.http, variante.idVariante);
    await iniciarCheckout(comprador, idMetodoEnvio);

    // Act
    const respuesta = await comprador.http.get('/api/checkout').query({ idMetodoEnvio: 2_147_000 });

    // Assert
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });

  it('GET /api/checkout con un idMetodoEnvio que no es entero positivo → 400', async () => {
    // Arrange
    const comprador = await nuevoCliente(app);

    // Act
    const respuesta = await comprador.http.get('/api/checkout').query({ idMetodoEnvio: 'abc' });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('un cupón que vence antes de iniciar el checkout → 422 CUPON_VENCIDO y no se reserva existencia', async () => {
    // Arrange
    const cupon = await crearCupon(admin, {
      fechaInicio: new Date(Date.now() - 60_000).toISOString(),
      fechaFin: new Date(Date.now() + 4_000).toISOString(),
    });
    const variante = await crearVariante(admin, 3);
    const comprador = await nuevoCliente(app);
    await agregarAlCarrito(comprador.http, variante.idVariante);
    const aplicado = await comprador.http.post('/api/carrito/cupon').send({ codigo: cupon.codigo });
    expect(aplicado.status, JSON.stringify(aplicado.body)).toBe(200);
    await new Promise((resolver) => setTimeout(resolver, 5_000));

    // Act
    const respuesta = await iniciarCheckout(comprador, idMetodoEnvio);

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(422);
    expect(respuesta.body.error.code).toBe('CUPON_VENCIDO');
    expect((await existencia(variante.sku)).existenciaReservada).toBe(0);
  });
});

describe('Listado de pedidos', () => {
  it('filtra por estado y número, ordena por total y valida el query', async () => {
    // Arrange
    const variante = await crearVariante(admin, 10);
    const cliente = await nuevoCliente(app);
    const barato = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 1 },
    ]);
    const caro = await comprar(cliente, idMetodoEnvio, [
      { idVariante: variante.idVariante, cantidad: 3 },
    ]);
    await cliente.http.post(`/api/pedidos/${barato}/cancelar`).send({});
    const numeroPedido = (
      (await detalle(cliente.http, caro)) as unknown as { numeroPedido: string }
    ).numeroPedido;

    // Act
    const cancelados = await cliente.http.get('/api/pedidos').query({ estado: 'CANCELADO' });
    const porTotal = await cliente.http.get('/api/pedidos').query({ sort: 'total:desc' });
    const porNumero = await cliente.http.get('/api/pedidos').query({ q: numeroPedido });
    const malOrden = await cliente.http.get('/api/pedidos').query({ sort: 'cliente:asc' });
    const hoy = new Date().toISOString().slice(0, 10);
    const rango = await cliente.http.get('/api/pedidos').query({ desde: hoy, hasta: hoy });

    // Assert
    expect((cancelados.body.items as { idPedido: number }[]).map((p) => p.idPedido)).toEqual([
      barato,
    ]);
    expect((porTotal.body.items as { idPedido: number }[]).map((p) => p.idPedido)).toEqual([
      caro,
      barato,
    ]);
    expect(porTotal.body.items[0]).toMatchObject({ total: expect.stringMatching(/^\d+\.\d{2}$/) });
    expect((porNumero.body.items as { idPedido: number }[]).map((p) => p.idPedido)).toEqual([caro]);
    expect(malOrden.status).toBe(400);
    expect(rango.status).toBe(200);
  });
});
