import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirStream, type SalidaStream } from '../../../../src/shared/eventos/stream.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';
import { eventos } from '../../../../src/shared/eventos/eventos.js';
import { transmitirEventos } from '../../../../src/shared/eventos/transmitir.js';
import type { UsuarioAutenticado } from '../../../../src/shared/types/express.js';

vi.mock('../../../../src/shared/eventos/stream.js', () => ({ abrirStream: vi.fn() }));
vi.mock('../../../../src/shared/eventos/eventos.js', () => ({
  eventos: { suscribir: vi.fn() },
}));

const USUARIO: UsuarioAutenticado = {
  idUsuario: 1,
  rol: 'Administrador',
  jti: 'j',
  sid: 's',
  iat: 1,
  exp: 2,
};

function entorno(destruida = false) {
  const alCerrar: (() => void)[] = [];
  const res = {
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
  const req = {
    usuario: USUARIO,
    destroyed: destruida,
    on: vi.fn((_evento: string, f: () => void) => void alCerrar.push(f)),
  };
  const liberar = vi.fn();
  vi.mocked(abrirStream).mockResolvedValue({ liberar });
  const ejecutar = (filtro?: (e: unknown) => boolean) =>
    transmitirEventos(req as unknown as Request, res as unknown as Response, filtro);
  const salida = (): SalidaStream => vi.mocked(abrirStream).mock.calls[0]![1];
  return { req, res, liberar, alCerrar, ejecutar, salida };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('transmitirEventos', () => {
  it('abre el stream con el usuario autenticado y suscribe al reparto de eventos', async () => {
    // Arrange
    const e = entorno();
    const oyente = vi.fn();

    // Act
    await e.ejecutar();
    await vi.mocked(abrirStream).mock.calls[0]![2](oyente);

    // Assert
    expect(abrirStream).toHaveBeenCalledWith(
      USUARIO,
      expect.any(Object),
      expect.any(Function),
      undefined,
    );
    expect(eventos.suscribir).toHaveBeenCalledWith(oyente);
  });

  it('abrir escribe los headers SSE y los envía', async () => {
    // Arrange
    const e = entorno();
    await e.ejecutar();

    // Act
    e.salida().abrir();

    // Assert
    expect(e.res.status).toHaveBeenCalledWith(200);
    expect(e.res.set).toHaveBeenCalledWith({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    expect(e.res.flushHeaders).toHaveBeenCalledTimes(1);
  });

  it('escribir y terminar delegan en res.write y res.end', async () => {
    // Arrange
    const e = entorno();
    await e.ejecutar();

    // Act
    e.salida().escribir('hola');
    e.salida().terminar();

    // Assert
    expect(e.res.write).toHaveBeenCalledWith('hola');
    expect(e.res.end).toHaveBeenCalledTimes(1);
  });

  it('al cerrarse la petición libera la conexión', async () => {
    // Arrange
    const e = entorno();
    await e.ejecutar();

    // Act
    e.alCerrar[0]!();

    // Assert
    expect(e.req.on).toHaveBeenCalledWith('close', e.liberar);
    expect(e.liberar).toHaveBeenCalledTimes(1);
  });

  it('si la petición ya estaba destruida al terminar de abrir, libera de inmediato', async () => {
    // Arrange
    const e = entorno(true);

    // Act
    await e.ejecutar();

    // Assert
    expect(e.liberar).toHaveBeenCalledTimes(1);
  });

  it('propaga el error del límite o de la suscripción sin registrar el cierre', async () => {
    // Arrange
    const e = entorno();
    vi.mocked(abrirStream).mockRejectedValue(new AppError('DEMASIADAS_SOLICITUDES', 'Límite'));

    // Act & Assert
    await expect(e.ejecutar()).rejects.toMatchObject({ code: 'DEMASIADAS_SOLICITUDES' });
    expect(e.req.on).not.toHaveBeenCalled();
  });

  it('pasa el filtro recibido a abrirStream', async () => {
    // Arrange
    const e = entorno();
    const filtro = vi.fn(() => true);

    // Act
    await e.ejecutar(filtro);

    // Assert
    expect(vi.mocked(abrirStream).mock.calls[0]![3]).toBe(filtro);
  });
});
