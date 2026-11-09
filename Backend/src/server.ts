import { createApp } from './app.js';
import { closePool } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closeRedis, connectRedis } from './config/redis.js';
import { eventos } from './shared/eventos/eventos.js';
import { cerrarConexionesStream } from './shared/eventos/stream.js';
import {
  detenerJobLiberarReservas,
  iniciarJobLiberarReservas,
} from './jobs/liberarReservas.job.js';

try {
  await connectRedis();
} catch (error) {
  // El cliente sigue reintentando; mientras tanto /api/health reporta redis: "down".
  logger.error({ err: error }, 'No se pudo conectar a Redis al arrancar');
}

const server = createApp().listen(env.PORT, () => {
  logger.info(`ShopCart API escuchando en el puerto ${env.PORT}`);
});

iniciarJobLiberarReservas();

let cerrando = false;
async function cerrar(senal: string): Promise<void> {
  if (cerrando) return;
  cerrando = true;
  logger.info(`${senal} recibido: cerrando el servidor`);
  server.close();
  // Los streams SSE no terminan solos: se cierran para que server.close() no espere.
  cerrarConexionesStream();
  // Primero el job (espera su pasada en curso), después el pool que usa.
  await detenerJobLiberarReservas();
  await Promise.allSettled([eventos.cerrarSuscriptor(), closePool()]);
  await closeRedis();
  process.exit(0);
}

process.on('SIGINT', () => void cerrar('SIGINT'));
process.on('SIGTERM', () => void cerrar('SIGTERM'));
