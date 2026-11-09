import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStore } from '../auth/tokenStore';
import type { EventoPedido } from '../types/pedidos';
import {
  ESPERA_LIMITE_MS,
  escucharEventosPedidos,
  REINTENTO_BASE_MS,
  separarBloques,
} from './eventosPedidos';
import type * as Http from './http';
import { renovarSesion } from './http';

vi.mock('./http', async (original) => ({
  ...(await original<typeof Http>()),
  renovarSesion: vi.fn(),
}));
const renovar = vi.mocked(renovarSesion);

const EVENTO: EventoPedido = {
  tipo: 'ESTADO',
  idPedido: 1503,
  idUsuario: 6,
  estado: 'EN_PREPARACION',
  fecha: '2026-11-08T12:00:00.000Z',
};
const CONECTADO = 'event: conectado\ndata: {"fecha":"2026-11-08T12:00:00.000Z"}\n\n';
const PEDIDO = `event: pedido\ndata: ${JSON.stringify(EVENTO)}\n\n`;
const fin = (motivo: string) => `event: fin\ndata: {"motivo":"${motivo}"}\n\n`;

type Respuesta = { status: number; trozos?: readonly string[]; cerrar?: boolean } | 'ERROR_RED';

/**
 * `fetch` simulado: cada llamada consume la siguiente respuesta. Un cuerpo sin `cerrar` queda
 * abierto (como el stream real) hasta que se aborta la señal.
 */
function simularFetch(...respuestas: Respuesta[]) {
  const cola = [...respuestas];
  const fetchFalso = vi.fn((_url: string, init: RequestInit) => {
    const r = cola.shift() ?? { status: 200, trozos: [] };
    if (r === 'ERROR_RED') return Promise.reject(new TypeError('Failed to fetch'));
    const codificador = new TextEncoder();
    const cuerpo = new ReadableStream<Uint8Array>({
      start(control) {
        for (const t of r.trozos ?? []) control.enqueue(codificador.encode(t));
        if (r.cerrar) control.close();
        init.signal?.addEventListener('abort', () =>
          control.error(new DOMException('Abortado', 'AbortError')),
        );
      },
    });
    return Promise.resolve(new Response(r.status === 204 ? null : cuerpo, { status: r.status }));
  });
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

function escuchar() {
  const control = new AbortController();
  const onEvento = vi.fn();
  const onConectado = vi.fn();
  const termino = escucharEventosPedidos({ onEvento, onConectado, signal: control.signal });
  let terminado = false;
  void termino.then(() => {
    terminado = true;
  });
  return { control, onEvento, onConectado, termino, terminado: () => terminado };
}

/** Deja correr las promesas pendientes (lecturas del stream) sin mover el reloj. */
const vaciar = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  renovar.mockReset();
  tokenStore.set('token-1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  tokenStore.clear();
});

describe('separarBloques', () => {
  it('separa eventos completos y devuelve lo incompleto como resto', () => {
    // Act
    const r = separarBloques(`${CONECTADO}event: pedido\ndata: {"id`);

    // Assert
    expect(r.bloques).toEqual([
      { evento: 'conectado', datos: '{"fecha":"2026-11-08T12:00:00.000Z"}' },
    ]);
    expect(r.resto).toBe('event: pedido\ndata: {"id');
  });

  it('ignora comentarios (latido), junta varias líneas data y lee retry', () => {
    // Act
    const r = separarBloques(': ping\n\nretry: 5000\n\ndata: a\ndata: b\n\n');

    // Assert
    expect(r.bloques).toEqual([
      { evento: 'message', datos: '', retry: 5000 },
      { evento: 'message', datos: 'a\nb' },
    ]);
    expect(r.resto).toBe('');
  });

  it('acepta saltos de línea CRLF, campos sin valor y descarta retry no numérico', () => {
    // Act
    const r = separarBloques('event: x\r\ndata\r\nretry: abc\r\n\r\n');

    // Assert
    expect(r.bloques).toEqual([{ evento: 'x', datos: '' }]);
  });
});

describe('escucharEventosPedidos', () => {
  it('conecta con el token y entrega conectado y los pedidos, aunque lleguen partidos', async () => {
    // Arrange
    const fetchFalso = simularFetch({
      status: 200,
      trozos: [CONECTADO, PEDIDO.slice(0, 20), PEDIDO.slice(20)],
    });

    // Act
    const e = escuchar();
    await vaciar();

    // Assert
    expect(fetchFalso).toHaveBeenCalledWith(
      '/api/pedidos/stream',
      expect.objectContaining({
        headers: { Accept: 'text/event-stream', Authorization: 'Bearer token-1' },
        credentials: 'include',
      }),
    );
    expect(e.onConectado).toHaveBeenCalledTimes(1);
    expect(e.onEvento).toHaveBeenCalledWith(EVENTO);
    e.control.abort();
    await e.termino;
  });

  it('sin token en memoria abre sin Authorization (y el 401 lleva a renovar)', async () => {
    // Arrange
    tokenStore.clear();
    const fetchFalso = simularFetch({ status: 401 });
    renovar.mockResolvedValue(false);

    // Act
    const e = escuchar();
    await e.termino;

    // Assert
    expect(fetchFalso.mock.calls[0]![1].headers).toEqual({ Accept: 'text/event-stream' });
  });

  it('401 → renueva la sesión y reconecta con el token nuevo', async () => {
    // Arrange
    const fetchFalso = simularFetch({ status: 401 }, { status: 200, trozos: [CONECTADO] });
    renovar.mockImplementation(() => {
      tokenStore.set('token-2');
      return Promise.resolve(true);
    });

    // Act
    const e = escuchar();
    await vaciar();

    // Assert
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(fetchFalso.mock.calls[1]![1].headers).toMatchObject({ Authorization: 'Bearer token-2' });
    expect(e.onConectado).toHaveBeenCalledTimes(1);
    e.control.abort();
  });

  it('401 y la sesión no se puede renovar → se detiene', async () => {
    // Arrange
    const fetchFalso = simularFetch({ status: 401 });
    renovar.mockResolvedValue(false);

    // Act
    const e = escuchar();
    await e.termino;

    // Assert
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('401 otra vez justo después de renovar → no renueva en bucle', async () => {
    // Arrange
    const fetchFalso = simularFetch({ status: 401 }, { status: 401 });
    renovar.mockResolvedValue(true);

    // Act
    const e = escuchar();
    await e.termino;

    // Assert
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('fin TOKEN_EXPIRADO → renueva y reconecta', async () => {
    // Arrange
    const fetchFalso = simularFetch(
      { status: 200, trozos: [CONECTADO, fin('TOKEN_EXPIRADO')] },
      { status: 200, trozos: [CONECTADO] },
    );
    renovar.mockResolvedValue(true);

    // Act
    const e = escuchar();
    await vaciar();

    // Assert
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(e.onConectado).toHaveBeenCalledTimes(2);
    e.control.abort();
  });

  it.each([
    ['fin REVOCADO', { status: 200, trozos: [CONECTADO, fin('REVOCADO')] }],
    ['403', { status: 403 }],
    ['204 sin cuerpo', { status: 204 }],
  ] as const)('%s → se detiene sin reconectar', async (_caso, respuesta) => {
    // Arrange
    const fetchFalso = simularFetch(respuesta);

    // Act
    const e = escuchar();
    await e.termino;

    // Assert
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(renovar).not.toHaveBeenCalled();
  });

  it.each([
    ['error de red', 'ERROR_RED'],
    ['5xx', { status: 503 }],
    ['fin SERVIDOR_DETENIDO', { status: 200, trozos: [fin('SERVIDOR_DETENIDO')] }],
    ['el servidor cierra el cuerpo', { status: 200, trozos: [], cerrar: true }],
  ] as const)('%s → reintenta a los 5 s', async (_caso, respuesta) => {
    // Arrange
    const fetchFalso = simularFetch(respuesta, { status: 200, trozos: [CONECTADO] });
    const e = escuchar();
    await vaciar();
    expect(fetchFalso).toHaveBeenCalledTimes(1);

    // Act
    await vi.advanceTimersByTimeAsync(REINTENTO_BASE_MS);

    // Assert
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(e.onConectado).toHaveBeenCalledTimes(1);
    e.control.abort();
  });

  it('cortes seguidos sin conectar → la espera se duplica', async () => {
    // Arrange
    const fetchFalso = simularFetch('ERROR_RED', 'ERROR_RED', { status: 200, trozos: [] });
    const e = escuchar();
    await vi.advanceTimersByTimeAsync(REINTENTO_BASE_MS);
    expect(fetchFalso).toHaveBeenCalledTimes(2);

    // Act
    await vi.advanceTimersByTimeAsync(REINTENTO_BASE_MS * 2 - 1);

    // Assert
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchFalso).toHaveBeenCalledTimes(3);
    e.control.abort();
  });

  it('usa el retry que indica el servidor', async () => {
    // Arrange
    const fetchFalso = simularFetch(
      { status: 200, trozos: ['retry: 1000\n\n'], cerrar: true },
      { status: 200, trozos: [] },
    );
    const e = escuchar();
    await vaciar();

    // Act
    await vi.advanceTimersByTimeAsync(1000);

    // Assert
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    e.control.abort();
  });

  it('429 (demasiadas conexiones) → espera 60 s antes de reintentar', async () => {
    // Arrange
    const fetchFalso = simularFetch({ status: 429 }, { status: 200, trozos: [] });
    const e = escuchar();
    await vi.advanceTimersByTimeAsync(ESPERA_LIMITE_MS - 1);
    expect(fetchFalso).toHaveBeenCalledTimes(1);

    // Act
    await vi.advanceTimersByTimeAsync(1);

    // Assert
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    e.control.abort();
  });

  it('abortar durante la espera de reconexión → termina sin volver a conectar', async () => {
    // Arrange
    const fetchFalso = simularFetch('ERROR_RED');
    const e = escuchar();
    await vaciar();

    // Act
    e.control.abort();
    await e.termino;
    await vi.advanceTimersByTimeAsync(REINTENTO_BASE_MS * 4);

    // Assert
    expect(e.terminado()).toBe(true);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('abortar con el stream abierto → termina', async () => {
    // Arrange
    simularFetch({ status: 200, trozos: [CONECTADO] });
    const e = escuchar();
    await vaciar();

    // Act
    e.control.abort();
    await e.termino;

    // Assert
    expect(e.terminado()).toBe(true);
  });

  it('abortar mientras fetch aún no responde → termina sin reintentar', async () => {
    // Arrange
    const fetchFalso = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () =>
            rechazar(new DOMException('Abortado', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchFalso);
    const e = escuchar();

    // Act
    e.control.abort();
    await e.termino;

    // Assert
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });
});
