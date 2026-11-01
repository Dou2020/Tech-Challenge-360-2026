import type { Request, RequestHandler } from 'express';
import { rateLimit, type RateLimitInfo } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { redis, redisDisponible } from '../config/redis.js';
import { claves } from '../shared/cache/claves.js';
import { AppError } from '../shared/errors/AppError.js';

interface OpcionesLimitador {
  /** Parte de la clave en Redis: shopcart:ratelimit:{nombre}:{ip}. */
  nombre: string;
  /** Solicitudes permitidas por IP en la ventana; 0 desactiva el limitador. */
  limite: number;
  ventanaMin: number;
}

/** express-rate-limit espera { error, warn }; se redirige a pino. */
const loggerLimitador = {
  error: (...args: unknown[]) => logger.warn({ detalle: args }, 'Rate limit: error del store'),
  warn: (...args: unknown[]) => logger.warn({ detalle: args }, 'Rate limit: advertencia'),
};

/**
 * Límite de solicitudes por IP con los contadores en Redis (compartidos entre instancias).
 *
 * Si Redis no responde el limitador deja pasar la solicitud (passOnStoreError). No abre un
 * hueco: login y registro dependen de Redis y responden 503 SERVICIO_NO_DISPONIBLE por su
 * cuenta (fail-closed), así que sin Redis nadie puede probar contraseñas de todos modos.
 */
export function crearLimitador({ nombre, limite, ventanaMin }: OpcionesLimitador): RequestHandler {
  if (limite === 0) return (_req, _res, next) => next();

  const ventanaMs = ventanaMin * 60_000;
  return rateLimit({
    windowMs: ventanaMs,
    limit: limite,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true,
    logger: loggerLimitador,
    store: new RedisStore({
      prefix: claves.prefijoRateLimit(nombre),
      // Sin Redis listo falla de inmediato en lugar de esperar la reconexión.
      sendCommand: (...args: string[]) => {
        if (!redisDisponible()) return Promise.reject(new Error('Redis no está disponible'));
        return redis.sendCommand(args) as Promise<RedisReply>;
      },
    }),
    handler: (req, _res, next) => {
      const info = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit;
      const restanteMs = info?.resetTime ? info.resetTime.getTime() - Date.now() : ventanaMs;
      next(
        new AppError(
          'DEMASIADAS_SOLICITUDES',
          'Demasiadas solicitudes desde esta dirección. Intenta de nuevo más tarde.',
          undefined,
          { retryAfterSeg: Math.max(1, Math.ceil(restanteMs / 1000)) },
        ),
      );
    },
  });
}

/** POST /api/auth/login: RATE_LIMIT_AUTH_MAX (10) por IP cada RATE_LIMIT_AUTH_VENTANA_MIN (15). */
export const limitarLogin = crearLimitador({
  nombre: 'login',
  limite: env.RATE_LIMIT_AUTH_MAX,
  ventanaMin: env.RATE_LIMIT_AUTH_VENTANA_MIN,
});

/** POST /api/auth/registro: mismo límite que el login, con su propio contador. */
export const limitarRegistro = crearLimitador({
  nombre: 'registro',
  limite: env.RATE_LIMIT_AUTH_MAX,
  ventanaMin: env.RATE_LIMIT_AUTH_VENTANA_MIN,
});
