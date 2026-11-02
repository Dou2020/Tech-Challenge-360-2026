import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redisDisponible } from '../../../../src/config/redis.js';
import { enRedis, exigirRedis } from '../../../../src/modules/auth/redisFailClosed.js';

vi.mock('../../../../src/config/redis.js', () => ({
  redisDisponible: vi.fn(),
  redis: {},
}));

const disponible = vi.mocked(redisDisponible);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('redisFailClosed', () => {
  it('exigirRedis con Redis caído lanza 503 SERVICIO_NO_DISPONIBLE', () => {
    // Arrange
    disponible.mockReturnValue(false);

    // Act & Assert
    expect(() => exigirRedis()).toThrowError(
      expect.objectContaining({ code: 'SERVICIO_NO_DISPONIBLE' }) as Error,
    );
  });

  it('enRedis con Redis caído no ejecuta la operación', async () => {
    // Arrange
    disponible.mockReturnValue(false);
    const operacion = vi.fn().mockResolvedValue('x');

    // Act & Assert
    await expect(enRedis(operacion)).rejects.toMatchObject({ code: 'SERVICIO_NO_DISPONIBLE' });
    expect(operacion).not.toHaveBeenCalled();
  });

  it('enRedis convierte el fallo de un comando en 503 SERVICIO_NO_DISPONIBLE', async () => {
    // Arrange
    disponible.mockReturnValue(true);
    const operacion = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

    // Act & Assert
    await expect(enRedis(operacion)).rejects.toMatchObject({ code: 'SERVICIO_NO_DISPONIBLE' });
  });

  it('enRedis devuelve el resultado de la operación cuando Redis responde', async () => {
    // Arrange
    disponible.mockReturnValue(true);

    // Act
    const resultado = await enRedis(async () => 42);

    // Assert
    expect(resultado).toBe(42);
  });
});
