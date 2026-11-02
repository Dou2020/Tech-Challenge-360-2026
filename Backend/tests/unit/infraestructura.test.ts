import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redisDisponible } from '../../src/config/redis.js';
import { enRedis, exigirRedis } from '../../src/modules/auth/redisFailClosed.js';
import { sistemaRepository } from '../../src/modules/sistema/sistema.repository.js';
import { sistemaService } from '../../src/modules/sistema/sistema.service.js';
import {
  hashearContrasena,
  verificarContraHashFicticio,
  verificarContrasena,
} from '../../src/shared/utils/contrasenas.js';

vi.mock('../../src/config/redis.js', () => ({
  redisDisponible: vi.fn(),
  redis: {},
}));
vi.mock('../../src/modules/sistema/sistema.repository.js', () => ({
  sistemaRepository: { verificarSqlServer: vi.fn(), verificarRedis: vi.fn() },
}));

const disponible = vi.mocked(redisDisponible);
const repo = vi.mocked(sistemaRepository);

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

describe('sistemaService.obtenerEstado', () => {
  it('todo arriba → ok', async () => {
    // Arrange
    disponible.mockReturnValue(true);
    repo.verificarSqlServer.mockResolvedValue(undefined);
    repo.verificarRedis.mockResolvedValue('PONG');

    // Act
    const estado = await sistemaService.obtenerEstado();

    // Assert
    expect(estado).toMatchObject({ status: 'ok', sqlServer: 'up', redis: 'up' });
  });

  it('Redis desconectado → degradado, sin hacer ping', async () => {
    // Arrange
    disponible.mockReturnValue(false);
    repo.verificarSqlServer.mockResolvedValue(undefined);

    // Act
    const estado = await sistemaService.obtenerEstado();

    // Assert
    expect(estado).toMatchObject({ status: 'degradado', sqlServer: 'up', redis: 'down' });
    expect(repo.verificarRedis).not.toHaveBeenCalled();
  });

  it('el ping a Redis falla → degradado', async () => {
    // Arrange
    disponible.mockReturnValue(true);
    repo.verificarSqlServer.mockResolvedValue(undefined);
    repo.verificarRedis.mockRejectedValue(new Error('timeout'));

    // Act
    const estado = await sistemaService.obtenerEstado();

    // Assert
    expect(estado).toMatchObject({ status: 'degradado', redis: 'down' });
  });

  it('SQL Server caído → caido aunque Redis responda', async () => {
    // Arrange
    disponible.mockReturnValue(true);
    repo.verificarSqlServer.mockRejectedValue(new Error('login failed'));
    repo.verificarRedis.mockResolvedValue('PONG');

    // Act
    const estado = await sistemaService.obtenerEstado();

    // Assert
    expect(estado).toMatchObject({ status: 'caido', sqlServer: 'down', redis: 'up' });
  });
});

describe('contrasenas', () => {
  it('un hash corrupto cuenta como contraseña inválida', async () => {
    // Arrange
    const hashCorrupto = 'no-es-un-hash-argon2';

    // Act
    const valida = await verificarContrasena(hashCorrupto, 'Cliente#2026');

    // Assert
    expect(valida).toBe(false);
  });

  it('hashear y verificar: la correcta pasa y otra no', async () => {
    // Arrange
    const hash = await hashearContrasena('Cliente#2026');

    // Act
    const [correcta, incorrecta] = await Promise.all([
      verificarContrasena(hash, 'Cliente#2026'),
      verificarContrasena(hash, 'Otra#2026'),
    ]);

    // Assert
    expect(hash).not.toContain('Cliente#2026');
    expect([correcta, incorrecta]).toEqual([true, false]);
  });

  it('verificarContraHashFicticio siempre resuelve false', async () => {
    // Act
    const resultado = await verificarContraHashFicticio('cualquiera');

    // Assert
    expect(resultado).toBe(false);
  });
});
