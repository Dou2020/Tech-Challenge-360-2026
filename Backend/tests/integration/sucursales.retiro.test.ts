import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo } from '../helpers/auth.js';
import {
  agregarAlCarrito,
  cuerpoPago,
  crearSucursal,
  crearVariante,
  iniciarCheckout,
  iniciarRetiro,
  metodoEnvio,
  metodoRetiro,
  nuevoCliente,
  pagarRetiro,
  prepararRetiro,
  type Http,
} from '../helpers/pedidos.js';

/*
 * Retiro en sucursal en el checkout y en los pedidos. Cada prueba crea su propia sucursal,
 * variante y cliente: no depende de la semilla ni de las existencias de otras pruebas.
 */

const app = createApp();
let admin: Http;
let operador: Http;
let idRetiro: number;
let idDomicilio: number;

beforeAll(async () => {
  await connectRedis();
  ({ http: admin } = await clienteComo(app, 'admin'));
  ({ http: operador } = await clienteComo(app, 'operador'));
  [idRetiro, idDomicilio] = await Promise.all([metodoRetiro(app), metodoEnvio(app)]);
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

async function existenciaDe(sku: string) {
  const r = await admin.get('/api/inventario/existencias').query({ q: sku });
  expect(r.status).toBe(200);
  return (
    r.body.items as { sku: string; existenciaFisica: number; existenciaReservada: number }[]
  ).find((e) => e.sku === sku)!;
}

describe('Retiro: validaciones al pagar', () => {
  it('pagar un retiro sin idSucursal → 400 VALIDACION', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const { cliente } = await prepararRetiro(app, admin, idSucursal);

    // Act
    const respuesta = await cliente.http
      .post('/api/checkout/pagar')
      .set('Idempotency-Key', randomUUID())
      .send({
        idMetodoEnvio: idRetiro,
        metodoPago: 'TARJETA',
        datosPago: { titular: 'Cliente de Prueba', ultimos4: '4242' },
      });

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('pagar un retiro con una sucursal que se desactivó tras iniciar → 404 NO_ENCONTRADO', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const { cliente } = await prepararRetiro(app, admin, idSucursal);
    const baja = await admin.patch(`/api/sucursales/${idSucursal}/estado`).send({ activo: false });
    expect(baja.status).toBe(200);

    // Act
    const respuesta = await pagarRetiro(cliente, idRetiro, idSucursal);

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });

  it('pagar un retiro con una sucursal inexistente → 404 NO_ENCONTRADO', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const { cliente } = await prepararRetiro(app, admin, idSucursal);

    // Act
    const respuesta = await pagarRetiro(cliente, idRetiro, 2_000_000_000);

    // Assert
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });
});

describe('Retiro: el detalle del pedido', () => {
  it('direccion.entrega incluye línea 2, horario y teléfono de la sucursal', async () => {
    // Arrange
    const { idSucursal, nombre } = await crearSucursal(admin, {
      telefono: '2333-4455',
      linea2: 'Local 7, Centro Comercial Los Arcos',
      horario: 'Lun-Sáb 8:30-19:00',
    });
    const { cliente } = await prepararRetiro(app, admin, idSucursal);
    const pago = await pagarRetiro(cliente, idRetiro, idSucursal);
    expect(pago.status, JSON.stringify(pago.body)).toBe(201);

    // Act
    const detalle = await cliente.http.get(`/api/pedidos/${pago.body.idPedido}`);

    // Assert
    const entrega = detalle.body.direccion.entrega as string;
    expect(entrega).toMatch(/^Recoger en /);
    expect(entrega).toContain(nombre);
    expect(entrega).toContain('Local 7, Centro Comercial Los Arcos');
    expect(entrega).toContain('Lun-Sáb 8:30-19:00');
    expect(entrega).toContain('2333-4455');
  });

  it('al renombrar la sucursal, sucursal.nombre cambia y la copia en entrega no', async () => {
    // Arrange
    const { idSucursal, nombre } = await crearSucursal(admin);
    const { cliente } = await prepararRetiro(app, admin, idSucursal);
    const pago = await pagarRetiro(cliente, idRetiro, idSucursal);
    const nuevoNombre = `${nombre} renombrada`;
    const edicion = await admin.put(`/api/sucursales/${idSucursal}`).send({
      nombre: nuevoNombre,
      telefono: '2222-3333',
      linea1: '5a. avenida 10-20, zona 1',
      municipio: 'Guatemala',
      departamento: 'Guatemala',
    });
    expect(edicion.status, JSON.stringify(edicion.body)).toBe(200);

    // Act
    const detalle = await cliente.http.get(`/api/pedidos/${pago.body.idPedido}`);

    // Assert
    expect(detalle.body.sucursal).toEqual({ idSucursal, nombre: nuevoNombre });
    expect(detalle.body.direccion.entrega).toContain(nombre);
    expect(detalle.body.direccion.entrega).not.toContain('renombrada');
  });

  it('un retiro con idDireccion lo ignora: direccion.idDireccion null y retiroEnSucursal true', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const { cliente } = await prepararRetiro(app, admin, idSucursal);

    // Act
    const pago = await cliente.http
      .post('/api/checkout/pagar')
      .set('Idempotency-Key', randomUUID())
      .send({ ...cuerpoPago(cliente, idRetiro), idSucursal });
    const detalle = await cliente.http.get(`/api/pedidos/${pago.body.idPedido}`);

    // Assert
    expect(pago.status, JSON.stringify(pago.body)).toBe(201);
    expect(detalle.body).toMatchObject({
      retiroEnSucursal: true,
      direccion: { idDireccion: null },
      sucursal: { idSucursal },
    });
  });

  it('un envío a domicilio con idSucursal lo ignora: sucursal null y la dirección del cliente', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const cliente = await nuevoCliente(app);
    const variante = await crearVariante(admin, 3);
    await agregarAlCarrito(cliente.http, variante.idVariante);
    const inicio = await iniciarCheckout(cliente, idDomicilio);
    expect(inicio.status).toBe(200);

    // Act
    const pago = await cliente.http
      .post('/api/checkout/pagar')
      .set('Idempotency-Key', randomUUID())
      .send({ ...cuerpoPago(cliente, idDomicilio), idSucursal });
    const detalle = await cliente.http.get(`/api/pedidos/${pago.body.idPedido}`);

    // Assert
    expect(pago.status, JSON.stringify(pago.body)).toBe(201);
    expect(detalle.body).toMatchObject({
      retiroEnSucursal: false,
      sucursal: null,
      direccion: { idDireccion: cliente.idDireccion },
    });
  });
});

describe('Retiro: idempotencia', () => {
  it('repetir la clave después de desactivar la sucursal sigue dando 200 con el mismo pedido', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const { cliente } = await prepararRetiro(app, admin, idSucursal);
    const clave = randomUUID();
    const primera = await pagarRetiro(cliente, idRetiro, idSucursal, clave);
    expect(primera.status, JSON.stringify(primera.body)).toBe(201);
    const baja = await admin.patch(`/api/sucursales/${idSucursal}/estado`).send({ activo: false });
    expect(baja.status).toBe(200);

    // Act
    const repeticion = await pagarRetiro(cliente, idRetiro, idSucursal, clave);

    // Assert
    expect(repeticion.status, JSON.stringify(repeticion.body)).toBe(200);
    expect(repeticion.body.idPedido).toBe(primera.body.idPedido);
  });

  it('la misma clave con otra sucursal → 409 IDEMPOTENCIA_CONFLICTO', async () => {
    // Arrange
    const [una, otra] = await Promise.all([crearSucursal(admin), crearSucursal(admin)]);
    const { cliente } = await prepararRetiro(app, admin, una.idSucursal);
    const clave = randomUUID();
    const primera = await pagarRetiro(cliente, idRetiro, una.idSucursal, clave);
    expect(primera.status, JSON.stringify(primera.body)).toBe(201);

    // Act
    const conflicto = await pagarRetiro(cliente, idRetiro, otra.idSucursal, clave);

    // Assert
    expect(conflicto.status).toBe(409);
    expect(conflicto.body.error.code).toBe('IDEMPOTENCIA_CONFLICTO');
  });
});

describe('Retiro: ciclo de vida del pedido', () => {
  it('cancelar un pedido de retiro → 200, reintegra la existencia y conserva retiroEnSucursal', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const { cliente, variante } = await prepararRetiro(app, admin, idSucursal, 4);
    const pago = await pagarRetiro(cliente, idRetiro, idSucursal);
    expect(pago.status, JSON.stringify(pago.body)).toBe(201);

    // Act
    const cancelado = await cliente.http
      .post(`/api/pedidos/${pago.body.idPedido}/cancelar`)
      .send({});

    // Assert
    expect(cancelado.status, JSON.stringify(cancelado.body)).toBe(200);
    expect(cancelado.body).toMatchObject({
      estado: 'CANCELADO',
      retiroEnSucursal: true,
      sucursal: { idSucursal },
    });
    expect(await existenciaDe(variante.sku)).toMatchObject({
      existenciaFisica: 4,
      existenciaReservada: 0,
    });
  });

  it('el Operador cambia el estado de un pedido de retiro y el detalle sigue siendo de retiro', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const { cliente } = await prepararRetiro(app, admin, idSucursal);
    const pago = await pagarRetiro(cliente, idRetiro, idSucursal);
    expect(pago.status, JSON.stringify(pago.body)).toBe(201);

    // Act
    const respuesta = await operador
      .patch(`/api/pedidos/${pago.body.idPedido}/estado`)
      .send({ estado: 'EN_PREPARACION' });

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body).toMatchObject({
      estado: 'EN_PREPARACION',
      retiroEnSucursal: true,
      sucursal: { idSucursal },
      direccion: { idDireccion: null },
    });
  });

  it('el Operador ve el pedido de retiro de un cliente con su sucursal', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const { cliente } = await prepararRetiro(app, admin, idSucursal);
    const pago = await pagarRetiro(cliente, idRetiro, idSucursal);

    // Act
    const detalle = await operador.get(`/api/pedidos/${pago.body.idPedido}`);

    // Assert
    expect(detalle.status).toBe(200);
    expect(detalle.body).toMatchObject({ retiroEnSucursal: true, sucursal: { idSucursal } });
  });
});

describe('Retiro: concurrencia', () => {
  it('dos clientes compran la última unidad con retiro al mismo tiempo → un 201 y un 409 STOCK_INSUFICIENTE', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const variante = await crearVariante(admin, 1);
    const [a, b] = await Promise.all([nuevoCliente(app), nuevoCliente(app)]);
    expect((await agregarAlCarrito(a.http, variante.idVariante)).status).toBe(200);
    expect((await agregarAlCarrito(b.http, variante.idVariante)).status).toBe(200);
    const comprarRetiro = async (cliente: typeof a) => {
      const inicio = await iniciarRetiro(cliente, idRetiro, idSucursal);
      return inicio.status === 200 ? pagarRetiro(cliente, idRetiro, idSucursal) : inicio;
    };

    // Act
    const respuestas = await Promise.all([comprarRetiro(a), comprarRetiro(b)]);

    // Assert
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respuestas.find((r) => r.status === 409)?.body.error.code).toBe('STOCK_INSUFICIENTE');
    expect(await existenciaDe(variante.sku)).toMatchObject({
      existenciaFisica: 0,
      existenciaReservada: 0,
    });
  });
});
