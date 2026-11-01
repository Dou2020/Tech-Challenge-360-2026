import { logger } from '../../config/logger.js';
import { redisDisponible } from '../../config/redis.js';
import { AppError } from '../../shared/errors/AppError.js';

function servicioNoDisponible(): AppError {
  return new AppError(
    'SERVICIO_NO_DISPONIBLE',
    'El servicio de sesiones no está disponible. Intenta de nuevo en unos momentos.',
  );
}

/** Lanza 503 si Redis no está listo; para comprobarlo antes de escribir en SQL Server. */
export function exigirRedis(): void {
  if (!redisDisponible()) throw servicioNoDisponible();
}

/**
 * Ejecuta una operación de sesiones, revocación o intentos de login en Redis.
 * Fail-closed: si Redis no está listo o el comando falla, responde 503 SERVICIO_NO_DISPONIBLE
 * en lugar de dejar pasar una petición que no se pudo verificar.
 */
export async function enRedis<T>(operacion: () => Promise<T>): Promise<T> {
  exigirRedis();
  try {
    return await operacion();
  } catch (error) {
    logger.error({ err: error }, 'Redis falló en una operación de autenticación');
    throw servicioNoDisponible();
  }
}
