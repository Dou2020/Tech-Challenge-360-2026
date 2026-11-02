import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redis, redisDisponible } from '../../../../src/config/redis.js';
import { tokensContrasenaStore } from '../../../../src/modules/auth/tokensContrasena.store.js';

vi.mock('../../../../src/config/redis.js', () => ({
  redisDisponible: vi.fn(),
  redis: { eval: vi.fn(), hGetAll: vi.fn() },
}));

const evalMock = vi.mocked(redis.eval);
const hGetAll = vi.mocked(redis.hGetAll);
const TOKEN_VALIDO = 'A'.repeat(43);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(redisDisponible).mockReturnValue(true);
});

describe('tokensContrasenaStore.emitir', () => {
  it('devuelve un token de 32 bytes en base64url y guarda solo su sha256', async () => {
    // Arrange
    evalMock.mockResolvedValue(1);

    // Act
    const token = await tokensContrasenaStore.emitir(7, 'CREAR');

    // Assert
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const opciones = evalMock.mock.calls[0]![1] as { keys: string[]; arguments: string[] };
    expect(JSON.stringify(opciones)).not.toContain(token);
    expect(opciones.keys[1]).toBe('shopcart:auth:token-contrasena:usuario:7');
    expect(opciones.keys[0]).toMatch(/^shopcart:auth:token-contrasena:[0-9a-f]{64}$/);
    expect(opciones.arguments.slice(1, 4)).toEqual(['7', 'CREAR', String(72 * 3600)]);
  });

  it('RESTABLECER usa TOKEN_RESTABLECER_MIN como vigencia', async () => {
    // Arrange
    evalMock.mockResolvedValue(1);

    // Act
    await tokensContrasenaStore.emitir(7, 'RESTABLECER');

    // Assert
    const opciones = evalMock.mock.calls[0]![1] as { arguments: string[] };
    expect(opciones.arguments[3]).toBe('3600');
  });

  it('cada emisión genera un token distinto', async () => {
    // Arrange
    evalMock.mockResolvedValue(1);

    // Act
    const a = await tokensContrasenaStore.emitir(7, 'CREAR');
    const b = await tokensContrasenaStore.emitir(7, 'CREAR');

    // Assert
    expect(a).not.toBe(b);
  });

  it('sin Redis responde 503 SERVICIO_NO_DISPONIBLE', async () => {
    // Arrange
    vi.mocked(redisDisponible).mockReturnValue(false);

    // Act
    const resultado = tokensContrasenaStore.emitir(7, 'CREAR');

    // Assert
    await expect(resultado).rejects.toMatchObject({ code: 'SERVICIO_NO_DISPONIBLE' });
  });
});

describe('tokensContrasenaStore.consultar', () => {
  it('devuelve el dueño y el propósito del token', async () => {
    // Arrange
    hGetAll.mockResolvedValue({ idUsuario: '7', proposito: 'RESTABLECER' });

    // Act
    const datos = await tokensContrasenaStore.consultar(TOKEN_VALIDO);

    // Assert
    expect(datos).toEqual({ idUsuario: 7, proposito: 'RESTABLECER' });
  });

  it('un token con formato inválido no consulta Redis', async () => {
    // Act
    const datos = await tokensContrasenaStore.consultar('corto');

    // Assert
    expect(datos).toBeUndefined();
    expect(hGetAll).not.toHaveBeenCalled();
  });

  it('un token desconocido o con datos corruptos devuelve undefined', async () => {
    // Arrange
    hGetAll.mockResolvedValueOnce({}).mockResolvedValueOnce({ idUsuario: 'x', proposito: 'CREAR' });

    // Act
    const desconocido = await tokensContrasenaStore.consultar(TOKEN_VALIDO);
    const corrupto = await tokensContrasenaStore.consultar(TOKEN_VALIDO);

    // Assert
    expect(desconocido).toBeUndefined();
    expect(corrupto).toBeUndefined();
  });
});

describe('tokensContrasenaStore.canjear', () => {
  it('devuelve los datos y consume el token con un solo script', async () => {
    // Arrange
    evalMock.mockResolvedValue(['7', 'CREAR']);

    // Act
    const datos = await tokensContrasenaStore.canjear(TOKEN_VALIDO);

    // Assert
    expect(datos).toEqual({ idUsuario: 7, proposito: 'CREAR' });
    expect(evalMock).toHaveBeenCalledTimes(1);
  });

  it('un token ya canjeado o vencido devuelve undefined', async () => {
    // Arrange
    evalMock.mockResolvedValue(null);

    // Act
    const datos = await tokensContrasenaStore.canjear(TOKEN_VALIDO);

    // Assert
    expect(datos).toBeUndefined();
  });

  it('un token con formato inválido no llega a Redis', async () => {
    // Act
    const datos = await tokensContrasenaStore.canjear('x');

    // Assert
    expect(datos).toBeUndefined();
    expect(evalMock).not.toHaveBeenCalled();
  });
});
