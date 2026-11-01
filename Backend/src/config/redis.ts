import { createClient } from 'redis';
import { env } from './env.js';
import { logger } from './logger.js';

export const redis = createClient({
  url: env.REDIS_URL,
  // Sin cola offline: mientras Redis está caído los comandos fallan de inmediato en lugar de
  // esperar la reconexión. Así la caché cae a la base (fail-open) y la autenticación responde
  // 503 (fail-closed) sin dejar peticiones colgadas.
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 5_000,
    // Reintenta con espera creciente hasta 5 s; nunca se rinde.
    reconnectStrategy: (intentos) => Math.min(intentos * 200, 5_000),
  },
});

export type RedisClient = typeof redis;

redis.on('error', (error: Error) => {
  logger.warn({ err: error }, 'Error de Redis');
});

export async function connectRedis(): Promise<void> {
  if (!redis.isOpen) await redis.connect();
}

/** true si el cliente está conectado y listo para recibir comandos. */
export function redisDisponible(): boolean {
  return redis.isReady;
}

export async function closeRedis(): Promise<void> {
  if (redis.isOpen) await redis.close();
}
