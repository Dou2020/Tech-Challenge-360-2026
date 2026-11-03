import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo } from '../helpers/auth.js';
import {
  agregarAlCarrito,
  crearVariante,
  cuerpoPago,
  iniciarCheckout,
  metodoEnvio,
  nuevoCliente,
  type ClientePrueba,
  type Http,
} from '../helpers/pedidos.js';

/*
 * Tarjetas guardadas del cliente y pago con ellas. Cada prueba usa un cliente recién registrado
 * para no alterar las dos tarjetas de la semilla. Solo se guardan titular, marca, tipo y últimos 4.
 */

const app = createApp();
let admin: Http;
let idMetodoEnvio: number;

const visa = { titular: 'Ana López', ultimos4: '4242', tipo: 'CREDITO', marca: 'VISA' };
const mastercard = { titular: 'Ana López', ultimos4: '5454', tipo: 'DEBITO', marca: 'MASTERCARD' };

interface TarjetaApi {
  idTarjeta: number;
  titular: string;
  ultimos4: string;
  tipo: string;
  marca: string;
  predeterminada: boolean;
  fechaCreacion: string;
}

const listar = async (http: Http) => (await http.get('/api/tarjetas')).body as TarjetaApi[];

/** Carrito con una unidad y checkout iniciado; devuelve el cliente listo para pagar. */
async function clienteConCheckout(): Promise<ClientePrueba> {
  const cliente = await nuevoCliente(app);
  const variante = await crearVariante(admin, 3);
  await agregarAlCarrito(cliente.http, variante.idVariante);
  expect((await iniciarCheckout(cliente, idMetodoEnvio)).status).toBe(200);
  return cliente;
}

const pagarCon = (
  cliente: ClientePrueba,
  datosPago: Record<string, unknown>,
  clave: string = randomUUID(),
) =>
  cliente.http
    .post('/api/checkout/pagar')
    .set('Idempotency-Key', clave)
    .send({ ...cuerpoPago(cliente, idMetodoEnvio), datosPago });

beforeAll(async () => {
  await connectRedis();
  ({ http: admin } = await clienteComo(app, 'admin'));
  idMetodoEnvio = await metodoEnvio(app);
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

describe('acceso', () => {
  it('sin token → 401; Operador y Administrador → 403', async () => {
    // Arrange
    const operador = await clienteComo(app, 'operador');

    // Act
    const sinToken = await request(app).get('/api/tarjetas');
    const comoOperador = await operador.http.get('/api/tarjetas');
    const comoAdmin = await admin.get('/api/tarjetas');

    // Assert
    expect(sinToken.status).toBe(401);
    expect(comoOperador.status).toBe(403);
    expect(comoAdmin.status).toBe(403);
  });

  it.each([
    ['PATCH', '/api/tarjetas/1/predeterminada'],
    ['DELETE', '/api/tarjetas/1'],
  ] as const)('%s sin token → 401', async (metodo, ruta) => {
    // Act
    const respuesta = await request(app)[metodo === 'PATCH' ? 'patch' : 'delete'](ruta);

    // Assert
    expect(respuesta.status).toBe(401);
  });

  it.each([
    ['PATCH', 'operador'],
    ['PATCH', 'admin'],
    ['DELETE', 'operador'],
    ['DELETE', 'admin'],
  ] as const)('%s como %s → 403', async (metodo, rol) => {
    // Arrange
    const { http } = await clienteComo(app, rol);
    const ruta = metodo === 'PATCH' ? '/api/tarjetas/1/predeterminada' : '/api/tarjetas/1';

    // Act
    const respuesta = await (metodo === 'PATCH' ? http.patch(ruta) : http.delete(ruta));

    // Assert
    expect(respuesta.status).toBe(403);
  });
});

describe('CRUD de tarjetas', () => {
  it('la primera queda predeterminada, la segunda no y solo una lo es', async () => {
    // Arrange
    const { http } = await nuevoCliente(app);

    // Act
    const primera = await http.post('/api/tarjetas').send(visa);
    const segunda = await http.post('/api/tarjetas').send(mastercard);
    const lista = await listar(http);

    // Assert
    expect(primera.status, JSON.stringify(primera.body)).toBe(201);
    expect(primera.body).toEqual({
      idTarjeta: expect.any(Number),
      ...visa,
      predeterminada: true,
      fechaCreacion: expect.stringMatching(/Z$/),
    });
    expect(segunda.body.predeterminada).toBe(false);
    expect(lista.map((t) => t.ultimos4)).toEqual(['4242', '5454']);
    expect(lista.filter((t) => t.predeterminada)).toHaveLength(1);
  });

  it('marcar predeterminada desmarca la anterior y eliminarla promueve a otra', async () => {
    // Arrange
    const { http } = await nuevoCliente(app);
    const primera = (await http.post('/api/tarjetas').send(visa)).body as TarjetaApi;
    const segunda = (await http.post('/api/tarjetas').send(mastercard)).body as TarjetaApi;

    // Act
    const marcada = await http.patch(`/api/tarjetas/${segunda.idTarjeta}/predeterminada`);
    const borrada = await http.delete(`/api/tarjetas/${segunda.idTarjeta}`);
    const lista = await listar(http);

    // Assert
    expect(marcada.status).toBe(200);
    expect(marcada.body).toMatchObject({ idTarjeta: segunda.idTarjeta, predeterminada: true });
    expect(borrada.status).toBe(204);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ idTarjeta: primera.idTarjeta, predeterminada: true });
  });

  it('duplicada → 409 DUPLICADO; 0000 → 402 PAGO_RECHAZADO sin guardar', async () => {
    // Arrange
    const { http } = await nuevoCliente(app);
    await http.post('/api/tarjetas').send(visa);

    // Act
    const duplicada = await http.post('/api/tarjetas').send(visa);
    const rechazada = await http.post('/api/tarjetas').send({ ...visa, ultimos4: '0000' });

    // Assert
    expect(duplicada.status).toBe(409);
    expect(duplicada.body.error.code).toBe('DUPLICADO');
    expect(rechazada.status).toBe(402);
    expect(rechazada.body.error.code).toBe('PAGO_RECHAZADO');
    expect(await listar(http)).toHaveLength(1);
  });

  it('datos inválidos → 400 VALIDACION con el campo', async () => {
    // Arrange
    const { http } = await nuevoCliente(app);

    // Act
    const respuesta = await http.post('/api/tarjetas').send({ ...visa, marca: 'DINERS' });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    expect(respuesta.body.error.details).toEqual([expect.objectContaining({ field: 'marca' })]);
  });

  it('la tarjeta de otro cliente → 404 en PATCH y DELETE y sigue intacta', async () => {
    // Arrange
    const [a, b] = await Promise.all([nuevoCliente(app), nuevoCliente(app)]);
    const ajena = (await b.http.post('/api/tarjetas').send(visa)).body as TarjetaApi;

    // Act
    const patch = await a.http.patch(`/api/tarjetas/${ajena.idTarjeta}/predeterminada`);
    const borrar = await a.http.delete(`/api/tarjetas/${ajena.idTarjeta}`);

    // Assert
    expect(patch.status).toBe(404);
    expect(borrar.status).toBe(404);
    expect(borrar.body.error.code).toBe('NO_ENCONTRADO');
    expect(await listar(b.http)).toHaveLength(1);
  });
});

describe('pagar con tarjetas', () => {
  it('con guardar: true la tarjeta aparece en la lista y el pedido trae su id', async () => {
    // Arrange
    const cliente = await clienteConCheckout();

    // Act
    const respuesta = await pagarCon(cliente, { ...visa, guardar: true });
    const lista = await listar(cliente.http);

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    expect(lista).toEqual([expect.objectContaining({ ...visa, predeterminada: true })]);
    expect(respuesta.body.idTarjetaGuardada).toBe(lista[0]!.idTarjeta);
  });

  it('repetir la clave devuelve 200 sin duplicar la tarjeta', async () => {
    // Arrange
    const cliente = await clienteConCheckout();
    const clave = randomUUID();
    const primera = await pagarCon(cliente, { ...visa, guardar: true }, clave);

    // Act
    const repetida = await pagarCon(cliente, { ...visa, guardar: true }, clave);

    // Assert
    expect(primera.status).toBe(201);
    expect(repetida.status).toBe(200);
    expect(repetida.body.idPedido).toBe(primera.body.idPedido);
    expect(repetida.body.idTarjetaGuardada).toBeNull();
    expect(await listar(cliente.http)).toHaveLength(1);
  });

  it('pagar dos veces con la misma tarjeta nueva deja una sola', async () => {
    // Arrange
    const cliente = await clienteConCheckout();
    await pagarCon(cliente, { ...visa, guardar: true });
    const variante = await crearVariante(admin, 3);
    await agregarAlCarrito(cliente.http, variante.idVariante);
    await iniciarCheckout(cliente, idMetodoEnvio);

    // Act
    const segunda = await pagarCon(cliente, { ...visa, guardar: true });

    // Assert
    expect(segunda.status).toBe(201);
    expect(await listar(cliente.http)).toHaveLength(1);
  });

  it('con 0000 y guardar → 402 y no se guarda', async () => {
    // Arrange
    const cliente = await clienteConCheckout();

    // Act
    const respuesta = await pagarCon(cliente, { ...visa, ultimos4: '0000', guardar: true });

    // Assert
    expect(respuesta.status).toBe(402);
    expect(respuesta.body.error.code).toBe('PAGO_RECHAZADO');
    expect(await listar(cliente.http)).toEqual([]);
  });

  it('con idTarjeta → 201 usando la tarjeta guardada', async () => {
    // Arrange
    const cliente = await clienteConCheckout();
    const guardada = (await cliente.http.post('/api/tarjetas').send(visa)).body as TarjetaApi;

    // Act
    const respuesta = await pagarCon(cliente, { idTarjeta: guardada.idTarjeta });

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    expect(respuesta.body.idTarjetaGuardada).toBe(guardada.idTarjeta);
  });

  it('idTarjeta junto con guardar → 400 VALIDACION', async () => {
    // Arrange
    const cliente = await clienteConCheckout();
    const guardada = (await cliente.http.post('/api/tarjetas').send(visa)).body as TarjetaApi;

    // Act
    const respuesta = await pagarCon(cliente, { idTarjeta: guardada.idTarjeta, guardar: true });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('guardar sin tipo ni marca → 400 en esos campos', async () => {
    // Arrange
    const cliente = await clienteConCheckout();

    // Act
    const respuesta = await pagarCon(cliente, { titular: 'Ana', ultimos4: '4242', guardar: true });

    // Assert
    expect(respuesta.status).toBe(400);
    expect((respuesta.body.error.details as { field: string }[]).map((d) => d.field)).toEqual([
      'datosPago.tipo',
      'datosPago.marca',
    ]);
  });

  it('pagar con la tarjeta de otro cliente o ya eliminada → 404, también al repetir la clave', async () => {
    // Arrange
    const cliente = await clienteConCheckout();
    const otro = await nuevoCliente(app);
    const ajena = (await otro.http.post('/api/tarjetas').send(visa)).body as TarjetaApi;
    const propia = (await cliente.http.post('/api/tarjetas').send(mastercard)).body as TarjetaApi;
    const clave = randomUUID();
    expect((await pagarCon(cliente, { idTarjeta: propia.idTarjeta }, clave)).status).toBe(201);
    await cliente.http.delete(`/api/tarjetas/${propia.idTarjeta}`);

    // Act
    const deOtro = await pagarCon(cliente, { idTarjeta: ajena.idTarjeta });
    const repetida = await pagarCon(cliente, { idTarjeta: propia.idTarjeta }, clave);

    // Assert
    expect(deOtro.status).toBe(404);
    expect(repetida.status).toBe(404);
    expect(repetida.body.error.code).toBe('NO_ENCONTRADO');
  });

  it('el cuerpo anterior { titular, ultimos4 } sigue funcionando y no guarda nada', async () => {
    // Arrange
    const cliente = await clienteConCheckout();

    // Act
    const respuesta = await pagarCon(cliente, { titular: 'Ana López', ultimos4: '4242' });

    // Assert
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.idTarjetaGuardada).toBeNull();
    expect(await listar(cliente.http)).toEqual([]);
  });
});

describe('casos puntuales', () => {
  it('POST con predeterminada: true desmarca la anterior', async () => {
    // Arrange
    const { http } = await nuevoCliente(app);
    const primera = (await http.post('/api/tarjetas').send(visa)).body as TarjetaApi;

    // Act
    const segunda = await http.post('/api/tarjetas').send({ ...mastercard, predeterminada: true });

    // Assert
    expect(segunda.status).toBe(201);
    expect(segunda.body.predeterminada).toBe(true);
    const lista = await listar(http);
    expect(lista[0]).toMatchObject({ ultimos4: '5454', predeterminada: true });
    expect(lista.find((t) => t.idTarjeta === primera.idTarjeta)?.predeterminada).toBe(false);
  });

  it('eliminar la última tarjeta deja la lista vacía', async () => {
    // Arrange
    const { http } = await nuevoCliente(app);
    const unica = (await http.post('/api/tarjetas').send(visa)).body as TarjetaApi;

    // Act
    const borrada = await http.delete(`/api/tarjetas/${unica.idTarjeta}`);

    // Assert
    expect(borrada.status).toBe(204);
    expect(await listar(http)).toEqual([]);
  });

  it('la misma clave con guardar distinto devuelve 200 sin guardar la tarjeta', async () => {
    // Arrange
    const cliente = await clienteConCheckout();
    const clave = randomUUID();
    const primera = await pagarCon(cliente, { titular: 'Ana', ultimos4: '4242' }, clave);
    expect(primera.status).toBe(201);

    // Act
    const repetida = await pagarCon(cliente, { ...visa, guardar: true }, clave);

    // Assert
    expect(repetida.status).toBe(200);
    expect(repetida.body.idPedido).toBe(primera.body.idPedido);
    expect(repetida.body.idTarjetaGuardada).toBeNull();
    expect(await listar(cliente.http)).toEqual([]);
  });

  it('cliente@shopcart.gt ve sus 2 tarjetas de la semilla, la predeterminada primero', async () => {
    // Arrange
    const { http } = await clienteComo(app, 'cliente');

    // Act
    const respuesta = await http.get('/api/tarjetas');

    // Assert
    expect(respuesta.status).toBe(200);
    const lista = respuesta.body as TarjetaApi[];
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({
      ultimos4: '4242',
      tipo: 'CREDITO',
      marca: 'VISA',
      predeterminada: true,
    });
    expect(lista[1]).toMatchObject({
      ultimos4: '5454',
      tipo: 'DEBITO',
      marca: 'MASTERCARD',
      predeterminada: false,
    });
  });
});
