import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { AUDIENCIA_TOKEN, EMISOR_TOKEN } from '../../src/modules/auth/tokens.js';
import { cerrarConexionesStream } from '../../src/modules/reportes/reportes.stream.js';
import { eventos } from '../../src/shared/eventos/eventos.js';
import { clienteComo, iniciarSesionComo } from '../helpers/auth.js';
import {
  avanzarPedido,
  comprar,
  iniciarCheckout,
  agregarAlCarrito,
  crearVariante,
  metodoEnvio,
  nuevoCliente,
  pagar,
  type ClientePrueba,
  type Http,
} from '../helpers/pedidos.js';

/*
 * Stream SSE del dashboard (GET /api/reportes/stream). supertest bufferea la respuesta, así que
 * se levanta el servidor en un puerto libre y se lee con fetch.
 */

const app = createApp();
let servidor: Server;
let base: string;
let admin: Http;
let operador: Http;
let tokenAdmin: string;
let tokenOperador: string;
let tokenCliente: string;
let idMetodoEnvio: number;
let cliente: ClientePrueba;
let idVariante: number;

const controladores: AbortController[] = [];

interface Lector {
  status: number;
  /** Texto acumulado del cuerpo. */
  texto: () => string;
  /** Cierra esta conexión desde el cliente. */
  cerrar: () => void;
  /** Espera a que el texto cumpla la condición. */
  esperar: (condicion: (texto: string) => boolean, ms?: number) => Promise<string>;
}

/** Abre el stream con fetch y acumula el cuerpo en segundo plano. */
async function abrirStream(token?: string): Promise<Lector> {
  const control = new AbortController();
  controladores.push(control);
  const respuesta = await fetch(`${base}/api/reportes/stream`, {
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
    signal: control.signal,
  });
  let acumulado = '';
  if (respuesta.status === 200) {
    const decodificador = new TextDecoder();
    const lector = respuesta.body!.getReader();
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await lector.read();
          if (done) return;
          acumulado += decodificador.decode(value, { stream: true });
        }
      } catch {
        // Lectura abortada al terminar la prueba.
      }
    })();
  } else {
    await respuesta.body?.cancel();
  }
  return {
    status: respuesta.status,
    texto: () => acumulado,
    cerrar: () => control.abort(),
    esperar: async (condicion, ms = 5_000) => {
      const limite = Date.now() + ms;
      while (!condicion(acumulado)) {
        if (Date.now() > limite) throw new Error(`Tiempo agotado. Recibido: ${acumulado}`);
        await new Promise((r) => setTimeout(r, 25));
      }
      return acumulado;
    },
  };
}

/** Extrae los datos JSON de los eventos `pedido` recibidos. */
function eventosPedido(texto: string): { tipo: string; idPedido: number; estado: string }[] {
  return [...texto.matchAll(/event: pedido\ndata: (.+)\n\n/g)].map((m) => JSON.parse(m[1]!));
}

beforeAll(async () => {
  await connectRedis();
  servidor = app.listen(0);
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const a = await clienteComo(app, 'admin');
  admin = a.http;
  tokenAdmin = a.sesion.accessToken;
  const op = await clienteComo(app, 'operador');
  operador = op.http;
  tokenOperador = op.sesion.accessToken;
  tokenCliente = (await clienteComo(app, 'cliente')).sesion.accessToken;
  idMetodoEnvio = await metodoEnvio(app);
  cliente = await nuevoCliente(app);
  idVariante = (await crearVariante(admin, 50)).idVariante;
});

afterEach(async () => {
  for (const c of controladores.splice(0)) c.abort();
  // El servidor detecta el cierre de forma asíncrona y libera el cupo de conexiones.
  await new Promise((r) => setTimeout(r, 150));
});

afterAll(async () => {
  cerrarConexionesStream();
  await eventos.cerrarSuscriptor();
  servidor.closeAllConnections();
  await new Promise((r) => servidor.close(r));
  await closeRedis();
  await closePool();
});

describe('GET /api/reportes/stream', () => {
  it('sin token responde 401, y Operador y Cliente reciben 403', async () => {
    // Arrange
    const tokens = [undefined, tokenOperador, tokenCliente];

    // Act
    const estados: number[] = [];
    for (const t of tokens) estados.push((await abrirStream(t)).status);

    // Assert
    expect(estados).toEqual([401, 403, 403]);
  });

  it('el Administrador recibe headers SSE y el evento conectado', async () => {
    // Arrange
    const control = new AbortController();
    controladores.push(control);

    // Act
    const respuesta = await fetch(`${base}/api/reportes/stream`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      signal: control.signal,
    });
    const primero = await respuesta.body!.getReader().read();

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(respuesta.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(respuesta.headers.get('x-accel-buffering')).toBe('no');
    expect(new TextDecoder().decode(primero.value)).toContain('event: conectado');
  });

  it('una compra emite pedido CREADO y el siguiente resumen responde MISS', async () => {
    // Arrange
    const stream = await abrirStream(tokenAdmin);
    await stream.esperar((t) => t.includes('event: conectado'));
    await admin.get('/api/reportes/resumen'); // calienta la caché

    // Act
    const idPedido = await comprar(cliente, idMetodoEnvio, [{ idVariante, cantidad: 1 }]);

    // Assert
    const texto = await stream.esperar((t) =>
      eventosPedido(t).some((e) => e.idPedido === idPedido),
    );
    expect(eventosPedido(texto).find((e) => e.idPedido === idPedido)).toEqual({
      tipo: 'CREADO',
      idPedido,
      estado: 'PAGADO',
      fecha: expect.any(String),
    });
    const resumen = await admin.get('/api/reportes/resumen');
    expect(resumen.headers['x-cache']).toBe('MISS');
  });

  it('cancelar el pedido emite CANCELADO', async () => {
    // Arrange
    const idPedido = await comprar(cliente, idMetodoEnvio, [{ idVariante, cantidad: 1 }]);
    const stream = await abrirStream(tokenAdmin);
    await stream.esperar((t) => t.includes('event: conectado'));

    // Act
    const cancelado = await cliente.http.post(`/api/pedidos/${idPedido}/cancelar`).send({});

    // Assert
    expect(cancelado.status, JSON.stringify(cancelado.body)).toBe(200);
    const texto = await stream.esperar((t) =>
      eventosPedido(t).some((e) => e.idPedido === idPedido),
    );
    expect(eventosPedido(texto)).toEqual([
      { tipo: 'CANCELADO', idPedido, estado: 'CANCELADO', fecha: expect.any(String) },
    ]);
  });

  it('repetir el pago con la misma clave no emite otro evento', async () => {
    // Arrange
    const clave = randomUUID();
    const stream = await abrirStream(tokenAdmin);
    await stream.esperar((t) => t.includes('event: conectado'));
    const agregado = await cliente.http
      .post('/api/carrito/items')
      .send({ idVariante, cantidad: 1 });
    expect(agregado.status).toBe(200);
    await cliente.http
      .post('/api/checkout/iniciar')
      .send({ idDireccion: cliente.idDireccion, idMetodoEnvio });
    const primero = await pagar(cliente, idMetodoEnvio, clave);
    expect(primero.status, JSON.stringify(primero.body)).toBe(201);
    await stream.esperar((t) => eventosPedido(t).length === 1);

    // Act
    const repetido = await pagar(cliente, idMetodoEnvio, clave);
    await new Promise((r) => setTimeout(r, 500));

    // Assert
    expect(repetido.status).toBe(200);
    expect(eventosPedido(stream.texto())).toHaveLength(1);
  });

  it('la sexta conexión simultánea del mismo administrador responde 429', async () => {
    // Arrange
    for (let i = 0; i < 5; i++) expect((await abrirStream(tokenAdmin)).status).toBe(200);

    // Act
    const sexta = await request(app)
      .get('/api/reportes/stream')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    // Assert
    expect(sexta.status).toBe(429);
    expect(sexta.body.error.code).toBe('DEMASIADAS_SOLICITUDES');
  });

  it('un cambio de estado hecho por el operador emite ESTADO con el estado nuevo', async () => {
    // Arrange
    const idPedido = await comprar(cliente, idMetodoEnvio, [{ idVariante, cantidad: 1 }]);
    const stream = await abrirStream(tokenAdmin);
    await stream.esperar((t) => t.includes('event: conectado'));

    // Act
    await avanzarPedido(operador, idPedido, 'EN_PREPARACION');

    // Assert
    const texto = await stream.esperar((t) =>
      eventosPedido(t).some((e) => e.idPedido === idPedido),
    );
    expect(eventosPedido(texto)).toEqual([
      { tipo: 'ESTADO', idPedido, estado: 'EN_PREPARACION', fecha: expect.any(String) },
    ]);
  });

  it('registrar una devolución parcial emite DEVOLUCION con el estado resultante', async () => {
    // Arrange
    const idPedido = await comprar(cliente, idMetodoEnvio, [{ idVariante, cantidad: 2 }]);
    await avanzarPedido(operador, idPedido, 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO');
    const pedido = await cliente.http.get(`/api/pedidos/${idPedido}`);
    const idPedidoDetalle = pedido.body.lineas[0].idPedidoDetalle as number;
    const stream = await abrirStream(tokenAdmin);
    await stream.esperar((t) => t.includes('event: conectado'));

    // Act
    const devolucion = await operador
      .post(`/api/pedidos/${idPedido}/devoluciones`)
      .send({ motivo: 'Defecto', lineas: [{ idPedidoDetalle, cantidad: 1 }] });

    // Assert
    expect(devolucion.status, JSON.stringify(devolucion.body)).toBe(201);
    const texto = await stream.esperar((t) =>
      eventosPedido(t).some((e) => e.idPedido === idPedido),
    );
    expect(eventosPedido(texto)).toEqual([
      { tipo: 'DEVOLUCION', idPedido, estado: 'DEVUELTO_PARCIAL', fecha: expect.any(String) },
    ]);
  });

  it('dos administradores conectados reciben el mismo evento', async () => {
    // Arrange
    const otraSesion = await iniciarSesionComo(app, 'admin');
    const primero = await abrirStream(tokenAdmin);
    const segundo = await abrirStream(otraSesion.accessToken);
    await primero.esperar((t) => t.includes('event: conectado'));
    await segundo.esperar((t) => t.includes('event: conectado'));

    // Act
    const idPedido = await comprar(cliente, idMetodoEnvio, [{ idVariante, cantidad: 1 }]);

    // Assert
    const coincide = (t: string) => eventosPedido(t).some((e) => e.idPedido === idPedido);
    const a = eventosPedido(await primero.esperar(coincide));
    const b = eventosPedido(await segundo.esperar(coincide));
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({ tipo: 'CREADO', idPedido });
  });

  it('un token que vence con el stream abierto cierra con fin TOKEN_EXPIRADO', async () => {
    // Arrange
    const sesion = await iniciarSesionComo(app, 'admin');
    const claims = jwt.decode(sesion.accessToken) as { sub: string; rol: string; sid: string };
    const tokenCorto = jwt.sign({ rol: claims.rol, sid: claims.sid }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: 2,
      subject: claims.sub,
      jwtid: randomUUID(),
      issuer: EMISOR_TOKEN,
      audience: AUDIENCIA_TOKEN,
    });
    const stream = await abrirStream(tokenCorto);
    expect(stream.status).toBe(200);

    // Act
    const texto = await stream.esperar((t) => t.includes('event: fin'), 10_000);

    // Assert
    expect(texto).toContain('event: fin\ndata: {"motivo":"TOKEN_EXPIRADO"}\n\n');
  });

  it('al cerrar una de las 5 conexiones se libera el cupo y se puede abrir otra', async () => {
    // Arrange
    const abiertas: Lector[] = [];
    for (let i = 0; i < 5; i++) abiertas.push(await abrirStream(tokenAdmin));
    const bloqueada = await request(app)
      .get('/api/reportes/stream')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(bloqueada.status).toBe(429);

    // Act
    abiertas[0]!.cerrar();
    let nueva: Lector | undefined;
    const limite = Date.now() + 5_000;
    while (Date.now() < limite) {
      const intento = await abrirStream(tokenAdmin);
      if (intento.status === 200) {
        nueva = intento;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    // Assert
    expect(nueva?.status).toBe(200);
  });

  it('un pago rechazado (402, tarjeta terminada en 0000) no emite evento', async () => {
    // Arrange
    const rechazado = await nuevoCliente(app);
    const agregado = await agregarAlCarrito(rechazado.http, idVariante, 1);
    expect(agregado.status).toBe(200);
    const inicio = await iniciarCheckout(rechazado, idMetodoEnvio);
    expect(inicio.status).toBe(200);
    const stream = await abrirStream(tokenAdmin);
    await stream.esperar((t) => t.includes('event: conectado'));

    // Act
    const pago = await pagar(rechazado, idMetodoEnvio, randomUUID(), '0000');
    await new Promise((r) => setTimeout(r, 500));

    // Assert
    expect(pago.status).toBe(402);
    expect(pago.body.error.code).toBe('PAGO_RECHAZADO');
    expect(eventosPedido(stream.texto())).toEqual([]);
  });
});
