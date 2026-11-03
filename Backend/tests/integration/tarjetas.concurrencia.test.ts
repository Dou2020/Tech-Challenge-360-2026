import { randomUUID } from 'node:crypto';
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
 * Tarjetas guardadas bajo concurrencia: una sola tarjeta por (cliente, marca, tipo, últimos 4) y
 * una sola predeterminada, sin importar el orden en que lleguen las peticiones.
 */

const app = createApp();
let admin: Http;
let idMetodoEnvio: number;

const visa = { titular: 'Ana López', ultimos4: '4242', tipo: 'CREDITO', marca: 'VISA' };
const mastercard = { titular: 'Ana López', ultimos4: '5454', tipo: 'DEBITO', marca: 'MASTERCARD' };

interface TarjetaApi {
  idTarjeta: number;
  ultimos4: string;
  predeterminada: boolean;
}

const listar = async (http: Http) => (await http.get('/api/tarjetas')).body as TarjetaApi[];

async function clienteConCheckout(): Promise<ClientePrueba> {
  const cliente = await nuevoCliente(app);
  const variante = await crearVariante(admin, 3);
  await agregarAlCarrito(cliente.http, variante.idVariante);
  expect((await iniciarCheckout(cliente, idMetodoEnvio)).status).toBe(200);
  return cliente;
}

const pagarGuardando = (cliente: ClientePrueba, clave: string) =>
  cliente.http
    .post('/api/checkout/pagar')
    .set('Idempotency-Key', clave)
    .send({ ...cuerpoPago(cliente, idMetodoEnvio), datosPago: { ...visa, guardar: true } });

beforeAll(async () => {
  await connectRedis();
  ({ http: admin } = await clienteComo(app, 'admin'));
  idMetodoEnvio = await metodoEnvio(app);
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

describe('tarjetas: concurrencia', () => {
  it('dos pagos simultáneos con guardar: true de la misma tarjeta nueva dejan una sola guardada', async () => {
    // Arrange
    const cliente = await clienteConCheckout();

    // Act
    const respuestas = await Promise.all([
      pagarGuardando(cliente, randomUUID()),
      pagarGuardando(cliente, randomUUID()),
    ]);

    // Assert
    expect(respuestas.some((r) => r.status === 201)).toBe(true);
    for (const r of respuestas) expect([201, 409, 422]).toContain(r.status);
    const lista = await listar(cliente.http);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ ultimos4: '4242', predeterminada: true });
  });

  it('el mismo pago con guardar: true enviado dos veces a la vez con la misma clave → 201 y 200 y una tarjeta', async () => {
    // Arrange
    const cliente = await clienteConCheckout();
    const clave = randomUUID();

    // Act
    const respuestas = await Promise.all([
      pagarGuardando(cliente, clave),
      pagarGuardando(cliente, clave),
    ]);

    // Assert
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(respuestas[0]!.body.idPedido).toBe(respuestas[1]!.body.idPedido);
    expect(await listar(cliente.http)).toHaveLength(1);
  });

  it('dos POST /api/tarjetas iguales a la vez → un 201 y un 409 DUPLICADO', async () => {
    // Arrange
    const { http } = await nuevoCliente(app);

    // Act
    const respuestas = await Promise.all([
      http.post('/api/tarjetas').send(visa),
      http.post('/api/tarjetas').send(visa),
    ]);

    // Assert
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respuestas.find((r) => r.status === 409)?.body.error.code).toBe('DUPLICADO');
    expect(await listar(http)).toHaveLength(1);
  });

  it('PATCH predeterminada simultáneo sobre dos tarjetas deja exactamente una predeterminada', async () => {
    // Arrange
    const { http } = await nuevoCliente(app);
    const a = (await http.post('/api/tarjetas').send(visa)).body as TarjetaApi;
    const b = (await http.post('/api/tarjetas').send(mastercard)).body as TarjetaApi;

    // Act
    const respuestas = await Promise.all([
      http.patch(`/api/tarjetas/${a.idTarjeta}/predeterminada`),
      http.patch(`/api/tarjetas/${b.idTarjeta}/predeterminada`),
    ]);

    // Assert
    expect(respuestas.map((r) => r.status)).toEqual([200, 200]);
    const lista = await listar(http);
    expect(lista).toHaveLength(2);
    expect(lista.filter((t) => t.predeterminada)).toHaveLength(1);
  });
});
