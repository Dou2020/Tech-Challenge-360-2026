import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revocacionStore } from '../../../../src/modules/auth/revocacion.store.js';
import {
  abrirStream,
  cerrarConexionesStream,
  formatearEvento,
  LATIDO_MS,
  MAX_CONEXIONES_POR_USUARIO,
  type SalidaStream,
} from '../../../../src/modules/reportes/reportes.stream.js';
import type { EventoPedido, OyenteEvento } from '../../../../src/shared/eventos/eventos.js';
import type { UsuarioAutenticado } from '../../../../src/shared/types/express.js';

vi.mock('../../../../src/modules/auth/revocacion.store.js', () => ({
  revocacionStore: { estaRevocado: vi.fn() },
}));

const estaRevocado = vi.mocked(revocacionStore.estaRevocado);
const AHORA = new Date('2026-11-02T20:00:00.000Z');
const EVENTO: EventoPedido = {
  tipo: 'CREADO',
  idPedido: 5,
  estado: 'PAGADO',
  fecha: '2026-11-02T20:15:00.000Z',
};

function usuario(idUsuario = 1, vidaSeg = 900): UsuarioAutenticado {
  const iat = Math.floor(AHORA.getTime() / 1000);
  return { idUsuario, rol: 'Administrador', jti: 'j', sid: 's', iat, exp: iat + vidaSeg };
}

function entorno() {
  const escrito: string[] = [];
  const salida: SalidaStream = {
    abrir: vi.fn(),
    escribir: (t) => void escrito.push(t),
    terminar: vi.fn(),
  };
  let oyente: OyenteEvento = () => undefined;
  const cancelar = vi.fn();
  const suscribir = vi.fn((o: OyenteEvento) => {
    oyente = o;
    return Promise.resolve(cancelar);
  });
  return { escrito, salida, suscribir, cancelar, emitir: (e: EventoPedido) => oyente(e) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  estaRevocado.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  cerrarConexionesStream();
  vi.useRealTimers();
});

describe('abrirStream', () => {
  it('escribe los headers, retry y el evento conectado', async () => {
    // Arrange
    const e = entorno();

    // Act
    await abrirStream(usuario(), e.salida, e.suscribir);

    // Assert
    expect(e.salida.abrir).toHaveBeenCalledTimes(1);
    expect(e.escrito[0]).toBe('retry: 5000\n\n');
    expect(e.escrito[1]).toMatch(/^event: conectado\ndata: \{"fecha":".+"\}\n\n$/);
  });

  it('reenvía los eventos de pedido con formato SSE', async () => {
    // Arrange
    const e = entorno();
    await abrirStream(usuario(), e.salida, e.suscribir);

    // Act
    e.emitir(EVENTO);

    // Assert
    expect(e.escrito.at(-1)).toBe(`event: pedido\ndata: ${JSON.stringify(EVENTO)}\n\n`);
  });

  it('el latido escribe un ping y revisa la revocación', async () => {
    // Arrange
    const e = entorno();
    await abrirStream(usuario(), e.salida, e.suscribir);

    // Act
    await vi.advanceTimersByTimeAsync(LATIDO_MS);

    // Assert
    expect(e.escrito).toContain(': ping\n\n');
    expect(estaRevocado).toHaveBeenCalledTimes(1);
    expect(e.salida.terminar).not.toHaveBeenCalled();
  });

  it('si el token se revocó envía fin REVOCADO y cierra', async () => {
    // Arrange
    const e = entorno();
    await abrirStream(usuario(), e.salida, e.suscribir);
    estaRevocado.mockResolvedValue(true);

    // Act
    await vi.advanceTimersByTimeAsync(LATIDO_MS);

    // Assert
    expect(e.escrito.at(-1)).toBe('event: fin\ndata: {"motivo":"REVOCADO"}\n\n');
    expect(e.salida.terminar).toHaveBeenCalledTimes(1);
    expect(e.cancelar).toHaveBeenCalledTimes(1);
  });

  it('si Redis no responde en el latido cierra con REVOCADO', async () => {
    // Arrange
    const e = entorno();
    await abrirStream(usuario(), e.salida, e.suscribir);
    estaRevocado.mockRejectedValue(new Error('Redis caído'));

    // Act
    await vi.advanceTimersByTimeAsync(LATIDO_MS);

    // Assert
    expect(e.escrito.at(-1)).toBe('event: fin\ndata: {"motivo":"REVOCADO"}\n\n');
    expect(e.salida.terminar).toHaveBeenCalledTimes(1);
  });

  it('al vencer el access token envía fin TOKEN_EXPIRADO y cierra', async () => {
    // Arrange
    const e = entorno();
    await abrirStream(usuario(1, 10), e.salida, e.suscribir);

    // Act
    await vi.advanceTimersByTimeAsync(10_000);

    // Assert
    expect(e.escrito.at(-1)).toBe('event: fin\ndata: {"motivo":"TOKEN_EXPIRADO"}\n\n');
    expect(e.salida.terminar).toHaveBeenCalledTimes(1);
  });

  it('liberar cancela la suscripción y detiene los timers', async () => {
    // Arrange
    const e = entorno();
    const conexion = await abrirStream(usuario(), e.salida, e.suscribir);

    // Act
    conexion.liberar();
    await vi.advanceTimersByTimeAsync(LATIDO_MS * 2);

    // Assert
    expect(e.cancelar).toHaveBeenCalledTimes(1);
    expect(estaRevocado).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('la conexión número 6 del mismo usuario responde 429 y liberar devuelve el cupo', async () => {
    // Arrange
    const conexiones = [];
    for (let i = 0; i < MAX_CONEXIONES_POR_USUARIO; i++) {
      conexiones.push(await abrirStream(usuario(7), entorno().salida, entorno().suscribir));
    }

    // Act
    const sexta = abrirStream(usuario(7), entorno().salida, entorno().suscribir);

    // Assert
    await expect(sexta).rejects.toMatchObject({ code: 'DEMASIADAS_SOLICITUDES' });
    conexiones[0]!.liberar();
    await expect(
      abrirStream(usuario(7), entorno().salida, entorno().suscribir),
    ).resolves.toBeDefined();
  });

  it('el límite es por usuario: otro usuario no se ve afectado', async () => {
    // Arrange
    for (let i = 0; i < MAX_CONEXIONES_POR_USUARIO; i++) {
      await abrirStream(usuario(8), entorno().salida, entorno().suscribir);
    }

    // Act
    const otro = abrirStream(usuario(9), entorno().salida, entorno().suscribir);

    // Assert
    await expect(otro).resolves.toBeDefined();
  });

  it('si la suscripción falla propaga el error sin escribir y libera el cupo', async () => {
    // Arrange
    const e = entorno();
    const suscribirFallida = vi.fn().mockRejectedValue(new Error('sin Redis'));

    // Act
    const accion = abrirStream(usuario(10), e.salida, suscribirFallida);

    // Assert
    await expect(accion).rejects.toThrow('sin Redis');
    expect(e.salida.abrir).not.toHaveBeenCalled();
    expect(e.escrito).toEqual([]);
    for (let i = 0; i < MAX_CONEXIONES_POR_USUARIO; i++) {
      await abrirStream(usuario(10), entorno().salida, entorno().suscribir);
    }
  });

  it('cerrarConexionesStream envía fin SERVIDOR_DETENIDO a las conexiones abiertas', async () => {
    // Arrange
    const e = entorno();
    await abrirStream(usuario(), e.salida, e.suscribir);

    // Act
    cerrarConexionesStream();

    // Assert
    expect(e.escrito.at(-1)).toBe('event: fin\ndata: {"motivo":"SERVIDOR_DETENIDO"}\n\n');
    expect(e.salida.terminar).toHaveBeenCalledTimes(1);
  });

  it('si escribir un evento en la salida falla, libera la conexión', async () => {
    // Arrange
    const e = entorno();
    let fallar = false;
    const salida: SalidaStream = {
      abrir: vi.fn(),
      escribir: () => {
        if (fallar) throw new Error('socket cerrado');
      },
      terminar: vi.fn(),
    };
    await abrirStream(usuario(11), salida, e.suscribir);
    fallar = true;

    // Act
    e.emitir(EVENTO);

    // Assert
    expect(e.cancelar).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('si escribir falla, el cupo de conexiones del usuario queda libre', async () => {
    // Arrange
    const e = entorno();
    let fallar = false;
    const salidaRota: SalidaStream = {
      abrir: vi.fn(),
      escribir: () => {
        if (fallar) throw new Error('socket cerrado');
      },
      terminar: vi.fn(),
    };
    await abrirStream(usuario(12), salidaRota, e.suscribir);
    for (let i = 0; i < MAX_CONEXIONES_POR_USUARIO - 1; i++) {
      await abrirStream(usuario(12), entorno().salida, entorno().suscribir);
    }
    fallar = true;
    e.emitir(EVENTO);

    // Act
    const nueva = abrirStream(usuario(12), entorno().salida, entorno().suscribir);

    // Assert
    await expect(nueva).resolves.toBeDefined();
  });
});

describe('formatearEvento', () => {
  it('arma las líneas event y data terminadas en una línea en blanco', () => {
    // Act
    const texto = formatearEvento('pedido', { tipo: 'CREADO', idPedido: 5 });

    // Assert
    expect(texto).toBe('event: pedido\ndata: {"tipo":"CREADO","idPedido":5}\n\n');
  });

  it('serializa los datos en una sola línea aunque contengan saltos de línea', () => {
    // Act
    const texto = formatearEvento('fin', { motivo: 'a\nb' });

    // Assert
    expect(texto).toBe('event: fin\ndata: {"motivo":"a\\nb"}\n\n');
  });
});
