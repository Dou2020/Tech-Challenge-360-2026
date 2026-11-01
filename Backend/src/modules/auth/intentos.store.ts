/**
 * Bloqueo de login por intentos fallidos con el mismo correo:
 *
 *   shopcart:auth:intentos:{correo}   contador de fallos
 *
 * La ventana empieza con el primer fallo y dura LOGIN_BLOQUEO_MIN. Al llegar a
 * LOGIN_MAX_INTENTOS la cuenta queda bloqueada LOGIN_BLOQUEO_MIN contados desde ese fallo,
 * aunque después llegue la contraseña correcta. Un login correcto borra el contador.
 *
 * Fail-closed: si Redis falla, las funciones lanzan 503 SERVICIO_NO_DISPONIBLE.
 */
import { env } from '../../config/env.js';
import { redis } from '../../config/redis.js';
import { claves } from '../../shared/cache/claves.js';
import { enRedis } from './redisFailClosed.js';

const VENTANA_SEG = env.LOGIN_BLOQUEO_MIN * 60;

/**
 * KEYS[1] contador; ARGV[1] ventana en segundos, ARGV[2] máximo de intentos.
 * Devuelve { intentos, segundos de bloqueo (0 si aún no se bloquea) }.
 */
const SCRIPT_REGISTRAR_FALLO = `
local intentos = redis.call('INCR', KEYS[1])
local maximo = tonumber(ARGV[2])
if intentos == 1 or intentos == maximo then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
if intentos >= maximo then
  return { intentos, redis.call('TTL', KEYS[1]) }
end
return { intentos, 0 }
`;

export interface ResultadoFallo {
  intentos: number;
  /** > 0 si con este fallo la cuenta quedó bloqueada. */
  segundosBloqueo: number;
}

export const intentosStore = {
  /** Segundos que faltan para desbloquear el correo; 0 si no está bloqueado. */
  segundosBloqueo(correo: string): Promise<number> {
    return enRedis(async () => {
      const clave = claves.intentosLogin(correo);
      const [intentos, ttl] = (await redis.multi().get(clave).ttl(clave).exec()) as unknown as [
        string | null,
        number,
      ];
      if (intentos === null || Number(intentos) < env.LOGIN_MAX_INTENTOS) return 0;
      return ttl > 0 ? ttl : VENTANA_SEG;
    });
  },

  registrarFallo(correo: string): Promise<ResultadoFallo> {
    return enRedis(async () => {
      const [intentos, segundosBloqueo] = (await redis.eval(SCRIPT_REGISTRAR_FALLO, {
        keys: [claves.intentosLogin(correo)],
        arguments: [String(VENTANA_SEG), String(env.LOGIN_MAX_INTENTOS)],
      })) as [number, number];
      return { intentos, segundosBloqueo: Math.max(segundosBloqueo, 0) };
    });
  },

  limpiar(correo: string): Promise<void> {
    return enRedis(async () => {
      await redis.del(claves.intentosLogin(correo));
    });
  },
};
