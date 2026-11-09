import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { eventos } from '../../src/shared/eventos/eventos.js';
import { cerrarConexionesStream } from '../../src/shared/eventos/stream.js';
import { clienteComo } from '../helpers/auth.js';
import {
  avanzarPedido,
  comprar,
  crearVariante,
  metodoEnvio,
  nuevoCliente,
  type ClientePrueba,
  type Http,
} from '../helpers/pedidos.js';

/*
 * Stream SSE de pedidos (GET /api/pedidos/stream): mantiene al día las vistas de pedidos.
 * El personal recibe todos los eventos; el Cliente, solo los de sus pedidos. Como en
 * reportes.stream.test.ts, se levanta el servidor en un puerto libre y se lee con fetch.
 */

const app = createApp();
let servidor: Server;
let base: string;
let admin: Http;
let operador: Http;
let tokenOperador: string;
let idMetodoEnvio: number;
let clienteA: ClientePrueba;
let clienteB: ClientePrueba;
let idVariante: number;

const controladores: AbortController[] = [];

interface EventoRecibido {
  tipo: string;
  idPedido: number;
  idUsuario: number;
  estado: string;
}

interface Lector {
  status: number;
  texto: () => string;
  esperar: (condicion: (texto: string) => boolean, ms?: number) => Promise<string>;
}

async function abrirStream(token?: string): Promise<Lector> {
  const control = new AbortController();
  controladores.push(control);
  const respuesta = await fetch(`${base}/api/pedidos/stream`, {
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

function eventosPedido(texto: string): EventoRecibido[] {
  return [...texto.matchAll(/event: pedido\ndata: (.+)\n\n/g)].map(
    (m) => JSON.parse(m[1]!) as EventoRecibido,
  );
}

const de = (idPedido: number) => (t: string) =>
  eventosPedido(t).some((e) => e.idPedido === idPedido);

beforeAll(async () => {
  await connectRedis();
  servidor = app.listen(0);
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  admin = (await clienteComo(app, 'admin')).http;
  const op = await clienteComo(app, 'operador');
  operador = op.http;
  tokenOperador = op.sesion.accessToken;
  idMetodoEnvio = await metodoEnvio(app);
  clienteA = await nuevoCliente(app);
  clienteB = await nuevoCliente(app);
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

describe('GET /api/pedidos/stream', () => {
  it('sin token responde 401', async () => {
    // Act
    const stream = await abrirStream();

    // Assert
    expect(stream.status).toBe(401);
  });

  it('el Operador recibe el cambio de estado de un pedido de cualquier cliente', async () => {
    // Arrange
    const idPedido = await comprar(clienteA, idMetodoEnvio, [{ idVariante, cantidad: 1 }]);
    const stream = await abrirStream(tokenOperador);
    await stream.esperar((t) => t.includes('event: conectado'));

    // Act
    const r = await admin.patch(`/api/pedidos/${idPedido}/estado`).send({
      estado: 'EN_PREPARACION',
    });

    // Assert
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const texto = await stream.esperar(de(idPedido));
    expect(eventosPedido(texto)).toEqual([
      {
        tipo: 'ESTADO',
        idPedido,
        idUsuario: clienteA.idUsuario,
        estado: 'EN_PREPARACION',
        fecha: expect.any(String),
      },
    ]);
  });

  it('el Cliente recibe los cambios de sus pedidos y no los de otro cliente', async () => {
    // Arrange
    const ajeno = await comprar(clienteB, idMetodoEnvio, [{ idVariante, cantidad: 1 }]);
    const propio = await comprar(clienteA, idMetodoEnvio, [{ idVariante, cantidad: 1 }]);
    const stream = await abrirStream(clienteA.token);
    expect(stream.status).toBe(200);
    await stream.esperar((t) => t.includes('event: conectado'));

    // Act: primero el ajeno, así al llegar el propio el ajeno ya habría llegado.
    await avanzarPedido(operador, ajeno, 'EN_PREPARACION');
    await avanzarPedido(operador, propio, 'EN_PREPARACION');

    // Assert
    const texto = await stream.esperar(de(propio));
    expect(eventosPedido(texto)).toEqual([
      expect.objectContaining({ tipo: 'ESTADO', idPedido: propio, idUsuario: clienteA.idUsuario }),
    ]);
  });

  it('el Cliente recibe la creación de su propio pedido', async () => {
    // Arrange
    const stream = await abrirStream(clienteB.token);
    await stream.esperar((t) => t.includes('event: conectado'));

    // Act
    const idPedido = await comprar(clienteB, idMetodoEnvio, [{ idVariante, cantidad: 1 }]);

    // Assert
    const texto = await stream.esperar(de(idPedido));
    expect(eventosPedido(texto).find((e) => e.idPedido === idPedido)).toMatchObject({
      tipo: 'CREADO',
      idUsuario: clienteB.idUsuario,
      estado: 'PAGADO',
    });
  });
});
