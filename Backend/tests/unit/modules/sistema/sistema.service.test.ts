import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redisDisponible } from '../../../../src/config/redis.js';
import { sistemaRepository } from '../../../../src/modules/sistema/sistema.repository.js';
import { sistemaService } from '../../../../src/modules/sistema/sistema.service.js';

vi.mock('../../../../src/config/redis.js', () => ({
  redisDisponible: vi.fn(),
  redis: {},
}));
vi.mock('../../../../src/modules/sistema/sistema.repository.js', () => ({
  sistemaRepository: { verificarSqlServer: vi.fn(), verificarRedis: vi.fn() },
}));

const disponible = vi.mocked(redisDisponible);
const repo = vi.mocked(sistemaRepository);

beforeEach(() => {
  vi.clearAllMocks();
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
