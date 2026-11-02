import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { executeSp } from '../../src/db/executeSp.js';
import { ejecutarLiberacionReservas } from '../../src/jobs/liberarReservas.job.js';
import { clienteComo } from '../helpers/auth.js';
import {
  agregarAlCarrito,
  crearVariante,
  cuerpoPago,
  iniciarCheckout,
  metodoEnvio,
  nuevoCliente,
  pagar,
  type ClientePrueba,
  type Http,
} from '../helpers/pedidos.js';

/*
 * Checkout y pago bajo concurrencia (RF-06, RF-05 en paralelo, RF-01). Cada prueba crea sus
 * propias variantes y clientes: no depende de las existencias de la semilla.
 */

const app = createApp();
let admin: Http;
let idMetodoEnvio: number;

const pedidosDe = async (cliente: ClientePrueba) => {
  const r = await cliente.http.get('/api/pedidos');
  expect(r.status).toBe(200);
  return r.body as { items: { idPedido: number }[]; total: number };
};

async function existencia(sku: string) {
  const r = await admin.get('/api/inventario/existencias').query({ q: sku });
  expect(r.status).toBe(200);
  return (
    r.body.items as {
      sku: string;
      existenciaFisica: number;
      existenciaReservada: number;
      existenciaDisponible: number;
    }[]
  ).find((e) => e.sku === sku)!;
}

beforeAll(async () => {
  await connectRedis();
  ({ http: admin } = await clienteComo(app, 'admin'));
  idMetodoEnvio = await metodoEnvio(app);
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

describe('RF-06: la última unidad', () => {
  it('dos clientes inician el checkout a la vez con la última unidad: uno 200 y otro 409', async () => {
    // Arrange
    const variante = await crearVariante(admin, 1);
    const [a, b] = await Promise.all([nuevoCliente(app), nuevoCliente(app)]);
    expect((await agregarAlCarrito(a.http, variante.idVariante)).status).toBe(200);
    expect((await agregarAlCarrito(b.http, variante.idVariante)).status).toBe(200);

    // Act
    const [ra, rb] = await Promise.all([
      iniciarCheckout(a, idMetodoEnvio),
      iniciarCheckout(b, idMetodoEnvio),
    ]);

    // Assert
    const estados = [ra.status, rb.status].sort();
    expect(estados).toEqual([200, 409]);
    const rechazada = ra.status === 409 ? ra : rb;
    expect(rechazada.body.error.code).toBe('STOCK_INSUFICIENTE');
    expect(rechazada.body.error.message).not.toContain('DETALLE=');
    expect(rechazada.body.error.details).toEqual([
      expect.objectContaining({ field: `idVariante:${variante.idVariante}` }),
    ]);
    const fila = await existencia(variante.sku);
    expect(fila).toMatchObject({
      existenciaFisica: 1,
      existenciaReservada: 1,
      existenciaDisponible: 0,
    });
  });

  it('dos pagos simultáneos con la misma Idempotency-Key: un 201, un 200 y un solo pedido', async () => {
    // Arrange
    const variante = await crearVariante(admin, 5);
    const cliente = await nuevoCliente(app);
    await agregarAlCarrito(cliente.http, variante.idVariante, 2);
    expect((await iniciarCheckout(cliente, idMetodoEnvio)).status).toBe(200);
    const clave = randomUUID();

    // Act
    const [r1, r2] = await Promise.all([
      pagar(cliente, idMetodoEnvio, clave),
      pagar(cliente, idMetodoEnvio, clave),
    ]);

    // Assert
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(r1.body.idPedido).toBe(r2.body.idPedido);
    expect(r1.headers.location).toBe(`/api/pedidos/${r1.body.idPedido}`);
    expect(r2.headers.location).toBe(`/api/pedidos/${r1.body.idPedido}`);
    expect(r1.body).toMatchObject({
      estado: 'PAGADO',
      total: expect.stringMatching(/^\d+\.\d{2}$/),
    });
    const pedidos = await pedidosDe(cliente);
    expect(pedidos.total).toBe(1);
    expect(await existencia(variante.sku)).toMatchObject({
      existenciaFisica: 3,
      existenciaReservada: 0,
    });
  });

  it('repetir la clave después del pago devuelve 200 con el mismo pedido', async () => {
    // Arrange
    const variante = await crearVariante(admin, 3);
    const cliente = await nuevoCliente(app);
    await agregarAlCarrito(cliente.http, variante.idVariante);
    await iniciarCheckout(cliente, idMetodoEnvio);
    const clave = randomUUID();
    const primera = await pagar(cliente, idMetodoEnvio, clave);

    // Act
    const repeticion = await pagar(cliente, idMetodoEnvio, clave);

    // Assert
    expect(primera.status).toBe(201);
    expect(repeticion.status).toBe(200);
    expect(repeticion.body).toEqual(primera.body);
    expect((await pedidosDe(cliente)).total).toBe(1);
  });

  it('la misma clave con un carrito modificado → 409 IDEMPOTENCIA_CONFLICTO', async () => {
    // Arrange
    const variante = await crearVariante(admin, 5);
    const otra = await crearVariante(admin, 5);
    const cliente = await nuevoCliente(app);
    await agregarAlCarrito(cliente.http, variante.idVariante);
    await iniciarCheckout(cliente, idMetodoEnvio);
    const clave = randomUUID();
    expect((await pagar(cliente, idMetodoEnvio, clave)).status).toBe(201);
    await agregarAlCarrito(cliente.http, otra.idVariante, 2);
    await iniciarCheckout(cliente, idMetodoEnvio);

    // Act
    const conflicto = await pagar(cliente, idMetodoEnvio, clave);

    // Assert
    expect(conflicto.status).toBe(409);
    expect(conflicto.body.error.code).toBe('IDEMPOTENCIA_CONFLICTO');
    expect((await pedidosDe(cliente)).total).toBe(1);
  });

  it('una clave que ya usó otro cliente no revela su pedido: 409', async () => {
    // Arrange
    const variante = await crearVariante(admin, 5);
    const [a, b] = await Promise.all([nuevoCliente(app), nuevoCliente(app)]);
    for (const c of [a, b]) {
      await agregarAlCarrito(c.http, variante.idVariante);
      await iniciarCheckout(c, idMetodoEnvio);
    }
    const clave = randomUUID();
    expect((await pagar(a, idMetodoEnvio, clave)).status).toBe(201);

    // Act
    const respuesta = await pagar(b, idMetodoEnvio, clave);

    // Assert
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('IDEMPOTENCIA_CONFLICTO');
  });

  it('sin Idempotency-Key → 400 IDEMPOTENCY_KEY_REQUERIDA', async () => {
    // Arrange
    const cliente = await nuevoCliente(app);

    // Act
    const respuesta = await pagar(cliente, idMetodoEnvio, null);

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('IDEMPOTENCY_KEY_REQUERIDA');
  });

  it('tarjeta 0000 → 402 PAGO_RECHAZADO y luego otra tarjeta paga con la misma reserva', async () => {
    // Arrange
    const variante = await crearVariante(admin, 2);
    const cliente = await nuevoCliente(app);
    await agregarAlCarrito(cliente.http, variante.idVariante);
    await iniciarCheckout(cliente, idMetodoEnvio);

    // Act
    const rechazo = await pagar(cliente, idMetodoEnvio, randomUUID(), '0000');
    const reservaTrasRechazo = await existencia(variante.sku);
    const exito = await pagar(cliente, idMetodoEnvio, randomUUID(), '4242');

    // Assert
    expect(rechazo.status).toBe(402);
    expect(rechazo.body.error.code).toBe('PAGO_RECHAZADO');
    expect(reservaTrasRechazo.existenciaReservada).toBe(1);
    expect(exito.status).toBe(201);
    expect((await pedidosDe(cliente)).total).toBe(1);
  });

  it('pagar sin haber iniciado el checkout → 409 RESERVA_VENCIDA', async () => {
    // Arrange
    const variante = await crearVariante(admin, 2);
    const cliente = await nuevoCliente(app);
    await agregarAlCarrito(cliente.http, variante.idVariante);

    // Act
    const respuesta = await pagar(cliente, idMetodoEnvio);

    // Assert
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('RESERVA_VENCIDA');
  });

  it('el cuerpo de pago inválido (método distinto de TARJETA, últimos4 con letras) → 400', async () => {
    // Arrange
    const cliente = await nuevoCliente(app);
    const base = cuerpoPago(cliente, idMetodoEnvio);

    // Act
    const efectivo = await cliente.http
      .post('/api/checkout/pagar')
      .set('Idempotency-Key', randomUUID())
      .send({ ...base, metodoPago: 'EFECTIVO' });
    const letras = await cliente.http
      .post('/api/checkout/pagar')
      .set('Idempotency-Key', randomUUID())
      .send({ ...base, datosPago: { titular: 'Ana', ultimos4: '12ab' } });

    // Assert
    expect(efectivo.status).toBe(400);
    expect(efectivo.body.error.code).toBe('VALIDACION');
    expect(letras.status).toBe(400);
  });
});

describe('RF-05: cupón con límite total en paralelo', () => {
  it('con limiteUsosTotal 1, dos clientes pagan a la vez: uno 201 y otro 422 CUPON_AGOTADO', async () => {
    // Arrange
    const variante = await crearVariante(admin, 10);
    const codigo = `PAR${randomUUID().slice(0, 8).toUpperCase()}`;
    const cupon = await admin.post('/api/cupones').send({
      codigo,
      descripcion: 'Un solo uso',
      tipoDescuento: 'PORCENTAJE',
      valor: '10',
      montoMinimo: '0.00',
      fechaInicio: new Date(Date.now() - 86_400_000).toISOString(),
      fechaFin: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      limiteUsosTotal: 1,
      limiteUsosPorCliente: 1,
    });
    expect(cupon.status, JSON.stringify(cupon.body)).toBe(201);
    const [a, b] = await Promise.all([nuevoCliente(app), nuevoCliente(app)]);
    for (const c of [a, b]) {
      await agregarAlCarrito(c.http, variante.idVariante);
      const aplicado = await c.http.post('/api/carrito/cupon').send({ codigo });
      expect(aplicado.status, JSON.stringify(aplicado.body)).toBe(200);
      expect((await iniciarCheckout(c, idMetodoEnvio)).status).toBe(200);
    }

    // Act
    const [ra, rb] = await Promise.all([pagar(a, idMetodoEnvio), pagar(b, idMetodoEnvio)]);

    // Assert
    expect([ra.status, rb.status].sort()).toEqual([201, 422]);
    const rechazada = ra.status === 422 ? ra : rb;
    expect(rechazada.body.error.code).toBe('CUPON_AGOTADO');
    const detalle = await admin.get(`/api/cupones/${cupon.body.idCupon}`);
    expect(detalle.body).toMatchObject({ usosActuales: 1, agotado: true });
    // El que perdió conserva su reserva: la compra no se hizo.
    expect(await existencia(variante.sku)).toMatchObject({
      existenciaFisica: 9,
      existenciaReservada: 1,
    });
  });
});

describe('Reservas vencidas', () => {
  it('el job libera la reserva vencida y la disponible vuelve; una vigente no se toca', async () => {
    // Arrange
    const variante = await crearVariante(admin, 3);
    const cliente = await nuevoCliente(app);
    await agregarAlCarrito(cliente.http, variante.idVariante, 2);
    expect((await iniciarCheckout(cliente, idMetodoEnvio)).status).toBe(200);
    const reservada = await existencia(variante.sku);

    // Act: una pasada real no toca una reserva vigente...
    await ejecutarLiberacionReservas();
    const trasPasada = await existencia(variante.sku);
    // ...y con el reloj una hora adelante (@Ahora) la reserva ya venció.
    await executeSp('SP_Inventario_LiberarReservasVencidas', [
      { nombre: 'Ahora', tipo: sql.DateTime2(3), valor: new Date(Date.now() + 3_600_000) },
    ]);
    const trasVencer = await existencia(variante.sku);
    const resumen = await cliente.http.get('/api/checkout');

    // Assert
    expect(reservada).toMatchObject({ existenciaReservada: 2, existenciaDisponible: 1 });
    expect(trasPasada.existenciaReservada).toBe(2);
    expect(trasVencer).toMatchObject({ existenciaReservada: 0, existenciaDisponible: 3 });
    expect(resumen.status).toBe(409);
    expect(resumen.body.error.code).toBe('RESERVA_VENCIDA');
  });

  it('DELETE /api/checkout/reserva libera la reserva y responde 204 (también sin reserva)', async () => {
    // Arrange
    const variante = await crearVariante(admin, 3);
    const cliente = await nuevoCliente(app);
    await agregarAlCarrito(cliente.http, variante.idVariante);
    await iniciarCheckout(cliente, idMetodoEnvio);

    // Act
    const primera = await cliente.http.delete('/api/checkout/reserva');
    const segunda = await cliente.http.delete('/api/checkout/reserva');

    // Assert
    expect(primera.status).toBe(204);
    expect(segunda.status).toBe(204);
    expect((await existencia(variante.sku)).existenciaReservada).toBe(0);
  });
});
