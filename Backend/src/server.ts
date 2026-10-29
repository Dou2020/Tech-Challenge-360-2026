import { createApp } from './app.js';
import { closePool } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closeRedis, connectRedis } from './config/redis.js';

try {
  await connectRedis();
} catch (error) {
  // El cliente sigue reintentando; mientras tanto /api/health reporta redis: "down".
  logger.error({ err: error }, 'No se pudo conectar a Redis al arrancar');
}

const server = createApp().listen(env.PORT, () => {
  logger.info(`ShopCart API escuchando en el puerto ${env.PORT}`);
});

let cerrando = false;
async function cerrar(senal: string): Promise<void> {
  if (cerrando) return;
  cerrando = true;
  logger.info(`${senal} recibido: cerrando el servidor`);
  server.close();
  await Promise.allSettled([closePool(), closeRedis()]);
  process.exit(0);
}

process.on('SIGINT', () => void cerrar('SIGINT'));
process.on('SIGTERM', () => void cerrar('SIGTERM'));
