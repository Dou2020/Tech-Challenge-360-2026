import { logger } from '../../config/logger.js';
import { redisDisponible } from '../../config/redis.js';
import { sistemaRepository } from './sistema.repository.js';
import type { EstadoDependencia, EstadoSistema } from './sistema.types.js';

async function verificar(
  nombre: string,
  comprobar: () => Promise<unknown>,
): Promise<EstadoDependencia> {
  try {
    await comprobar();
    return 'up';
  } catch (error) {
    logger.warn({ err: error }, `Health check: ${nombre} no responde`);
    return 'down';
  }
}

export const sistemaService = {
  async obtenerEstado(): Promise<EstadoSistema> {
    const [sqlServer, redis] = await Promise.all([
      verificar('SQL Server', () => sistemaRepository.verificarSqlServer()),
      // Si el cliente está reconectando, no se espera a que vuelva: se reporta caído.
      redisDisponible()
        ? verificar('Redis', () => sistemaRepository.verificarRedis())
        : Promise.resolve<EstadoDependencia>('down'),
    ]);

    const status = sqlServer === 'down' ? 'caido' : redis === 'down' ? 'degradado' : 'ok';
    return { status, sqlServer, redis, timestamp: new Date().toISOString() };
  },
};
