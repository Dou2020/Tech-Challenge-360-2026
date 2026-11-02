/**
 * Tokens de un solo uso para crear o restablecer la contraseña (enlaces de correo), en Redis:
 *
 *   shopcart:auth:token-contrasena:{sha256}        hash { idUsuario, proposito: CREAR|RESTABLECER }
 *   shopcart:auth:token-contrasena:usuario:{id}    sha256 del único token vigente del usuario
 *
 * El token son 32 bytes aleatorios en base64url; solo se guarda su sha256, así que un volcado de
 * Redis no sirve para armar un enlace. Emitir un token nuevo invalida el anterior del usuario.
 * El canje es atómico (script Lua): dos peticiones con el mismo token no pueden ganar las dos.
 * TTL: TOKEN_CREAR_HORAS para CREAR y TOKEN_RESTABLECER_MIN para RESTABLECER.
 *
 * Fail-closed: si Redis falla, las funciones lanzan 503 SERVICIO_NO_DISPONIBLE.
 */
import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { redis } from '../../config/redis.js';
import { claves } from '../../shared/cache/claves.js';
import { enRedis } from './redisFailClosed.js';

export type PropositoToken = 'CREAR' | 'RESTABLECER';

export interface DatosTokenContrasena {
  idUsuario: number;
  proposito: PropositoToken;
}

export const TTL_TOKEN_SEG: Record<PropositoToken, number> = {
  CREAR: env.TOKEN_CREAR_HORAS * 3600,
  RESTABLECER: env.TOKEN_RESTABLECER_MIN * 60,
};

/** Vigencia de cada propósito en minutos, para el texto de los correos. */
export const VIGENCIA_TOKEN_MIN: Record<PropositoToken, number> = {
  CREAR: env.TOKEN_CREAR_HORAS * 60,
  RESTABLECER: env.TOKEN_RESTABLECER_MIN,
};

/** 32 bytes en base64url = 43 caracteres. */
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const hashearToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Guarda el token nuevo y borra el vigente del usuario, si lo había.
 * KEYS[1] token nuevo, KEYS[2] vigente del usuario; ARGV[1] sha256 nuevo, ARGV[2] idUsuario,
 * ARGV[3] propósito, ARGV[4] TTL en segundos, ARGV[5] prefijo de token-contrasena:
 */
const SCRIPT_EMITIR = `
local anterior = redis.call('GET', KEYS[2])
if anterior then
  redis.call('DEL', ARGV[5] .. anterior)
end
redis.call('HSET', KEYS[1], 'idUsuario', ARGV[2], 'proposito', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[4])
return 1
`;

/**
 * Canje de un solo uso: borra el token y, si era el vigente del usuario, también ese puntero.
 * KEYS[1] token; ARGV[1] sha256, ARGV[2] prefijo de token-contrasena:usuario:.
 * Devuelve { idUsuario, proposito } o false si no existe o venció.
 */
const SCRIPT_CANJEAR = `
local idUsuario = redis.call('HGET', KEYS[1], 'idUsuario')
if not idUsuario then
  return false
end
local proposito = redis.call('HGET', KEYS[1], 'proposito')
redis.call('DEL', KEYS[1])
local claveUsuario = ARGV[2] .. idUsuario
if redis.call('GET', claveUsuario) == ARGV[1] then
  redis.call('DEL', claveUsuario)
end
return { idUsuario, proposito }
`;

function aDatos(datos: Record<string, string>): DatosTokenContrasena | undefined {
  const idUsuario = Number(datos.idUsuario);
  if (!Number.isInteger(idUsuario) || idUsuario <= 0) return undefined;
  if (datos.proposito !== 'CREAR' && datos.proposito !== 'RESTABLECER') return undefined;
  return { idUsuario, proposito: datos.proposito };
}

export const tokensContrasenaStore = {
  /** Emite un token nuevo para el usuario (invalida el anterior) y devuelve el token en claro. */
  emitir(idUsuario: number, proposito: PropositoToken): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const hash = hashearToken(token);
    return enRedis(async () => {
      await redis.eval(SCRIPT_EMITIR, {
        keys: [claves.tokenContrasena(hash), claves.tokenContrasenaUsuario(idUsuario)],
        arguments: [
          hash,
          String(idUsuario),
          proposito,
          String(TTL_TOKEN_SEG[proposito]),
          claves.prefijoTokenContrasena(),
        ],
      });
      return token;
    });
  },

  /** Lee el token sin consumirlo (para que la UI sepa si el enlace sirve). */
  consultar(token: string): Promise<DatosTokenContrasena | undefined> {
    if (!FORMATO_TOKEN.test(token)) return Promise.resolve(undefined);
    return enRedis(async () => {
      const datos = await redis.hGetAll(claves.tokenContrasena(hashearToken(token)));
      return aDatos(datos);
    });
  },

  /** Consume el token: la segunda llamada con el mismo token devuelve undefined. */
  canjear(token: string): Promise<DatosTokenContrasena | undefined> {
    if (!FORMATO_TOKEN.test(token)) return Promise.resolve(undefined);
    const hash = hashearToken(token);
    return enRedis(async () => {
      const respuesta = (await redis.eval(SCRIPT_CANJEAR, {
        keys: [claves.tokenContrasena(hash)],
        arguments: [hash, claves.prefijoTokenContrasenaUsuario()],
      })) as [string, string] | null;
      if (!respuesta) return undefined;
      return aDatos({ idUsuario: respuesta[0], proposito: respuesta[1] });
    });
  },
};
