/**
 * Sesiones (refresh tokens) en Redis. No hay tabla en SQL Server.
 *
 *   shopcart:sesion:token:{sha256}   hash { idUsuario, familia }   — un registro por token emitido,
 *                                     incluidos los ya rotados (sirve para detectar reutilización)
 *   shopcart:sesion:familia:{sid}    hash { idUsuario, tokenActual } — la sesión; si no existe, terminó
 *   shopcart:sesion:usuario:{id}     set de familias del usuario (para revocarlas todas)
 *
 * Todas con TTL de REFRESH_TOKEN_DAYS, renovado en cada rotación. Fail-closed: si Redis falla,
 * cada función lanza 503 SERVICIO_NO_DISPONIBLE.
 */
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { redis } from '../../config/redis.js';
import { claves } from '../../shared/cache/claves.js';
import { enRedis } from './redisFailClosed.js';
import { familiaDeRefreshToken, generarRefreshToken, hashToken } from './tokens.js';

const TTL_SESION_SEG = env.REFRESH_TOKEN_DAYS * 86_400;

/**
 * Rotación atómica. Como Redis ejecuta un script a la vez, dos refresh simultáneos con el mismo
 * token no pueden rotarlo dos veces: el primero cambia tokenActual y el segundo ya ve otro valor.
 *
 * KEYS[1] token presentado, KEYS[2] familia, KEYS[3] token nuevo
 * ARGV[1] hash del token presentado, ARGV[2] hash del token nuevo, ARGV[3] familia,
 * ARGV[4] TTL en segundos, ARGV[5] prefijo de sesion:usuario:
 *
 * Devuelve { 1, idUsuario } rotado; { 0 } desconocido, vencido o sesión ya terminada;
 * { -1, idUsuario } reutilización de un token ya rotado: borra la familia completa.
 */
const SCRIPT_ROTAR = `
local idUsuario = redis.call('HGET', KEYS[1], 'idUsuario')
local familia = redis.call('HGET', KEYS[1], 'familia')
if not idUsuario or familia ~= ARGV[3] then
  return { 0 }
end
local actual = redis.call('HGET', KEYS[2], 'tokenActual')
if not actual then
  return { 0 }
end
if actual ~= ARGV[1] then
  redis.call('DEL', KEYS[2])
  redis.call('SREM', ARGV[5] .. idUsuario, ARGV[3])
  return { -1, idUsuario }
end
redis.call('HSET', KEYS[2], 'tokenActual', ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('HSET', KEYS[3], 'idUsuario', idUsuario, 'familia', ARGV[3])
redis.call('EXPIRE', KEYS[3], ARGV[4])
redis.call('EXPIRE', ARGV[5] .. idUsuario, ARGV[4])
return { 1, idUsuario }
`;

/**
 * Borra las familias del usuario de una vez, salvo la indicada (cambio de contraseña: se
 * conserva la sesión desde la que se hizo el cambio).
 * KEYS[1] sesion:usuario:{id}; ARGV[1] prefijo de sesion:familia:, ARGV[2] familia a conservar
 * ('' para ninguna). Devuelve cuántas borró.
 */
const SCRIPT_REVOCAR_USUARIO = `
local familias = redis.call('SMEMBERS', KEYS[1])
local borradas = 0
for _, familia in ipairs(familias) do
  if familia ~= ARGV[2] then
    redis.call('DEL', ARGV[1] .. familia)
    redis.call('SREM', KEYS[1], familia)
    borradas = borradas + 1
  end
end
return borradas
`;

export interface SesionCreada {
  refreshToken: string;
  sid: string;
}

export interface DatosSesion {
  idUsuario: number;
  sid: string;
}

export type ResultadoRotacion =
  | { estado: 'rotado'; idUsuario: number; sid: string; refreshToken: string }
  | { estado: 'invalido' }
  | { estado: 'reutilizado'; idUsuario: number; sid: string };

export const sesionesStore = {
  /** Abre una sesión nueva (login o registro) con su primer refresh token. */
  crear(idUsuario: number): Promise<SesionCreada> {
    return enRedis(async () => {
      const sid = randomUUID();
      const refreshToken = generarRefreshToken(sid);
      const hash = hashToken(refreshToken);
      const id = String(idUsuario);
      await redis
        .multi()
        .hSet(claves.sesionToken(hash), { idUsuario: id, familia: sid })
        .expire(claves.sesionToken(hash), TTL_SESION_SEG)
        .hSet(claves.sesionFamilia(sid), { idUsuario: id, tokenActual: hash })
        .expire(claves.sesionFamilia(sid), TTL_SESION_SEG)
        .sAdd(claves.sesionesUsuario(idUsuario), sid)
        .expire(claves.sesionesUsuario(idUsuario), TTL_SESION_SEG)
        .exec();
      return { refreshToken, sid };
    });
  },

  /**
   * Usuario y familia de un refresh token, sin rotarlo. Puede ser un token ya rotado:
   * la decisión final la toma `rotar`. undefined si el token no existe o venció.
   */
  obtener(refreshToken: string): Promise<DatosSesion | undefined> {
    const sid = familiaDeRefreshToken(refreshToken);
    if (!sid) return Promise.resolve(undefined);
    return enRedis(async () => {
      const datos = await redis.hGetAll(claves.sesionToken(hashToken(refreshToken)));
      if (!datos.idUsuario || datos.familia !== sid) return undefined;
      return { idUsuario: Number(datos.idUsuario), sid };
    });
  },

  /** Cambia el refresh token por uno nuevo de forma atómica (ver SCRIPT_ROTAR). */
  rotar(refreshToken: string): Promise<ResultadoRotacion> {
    const sid = familiaDeRefreshToken(refreshToken);
    if (!sid) return Promise.resolve({ estado: 'invalido' });
    return enRedis(async () => {
      const hashActual = hashToken(refreshToken);
      const nuevo = generarRefreshToken(sid);
      const hashNuevo = hashToken(nuevo);
      const respuesta = (await redis.eval(SCRIPT_ROTAR, {
        keys: [
          claves.sesionToken(hashActual),
          claves.sesionFamilia(sid),
          claves.sesionToken(hashNuevo),
        ],
        arguments: [
          hashActual,
          hashNuevo,
          sid,
          String(TTL_SESION_SEG),
          claves.prefijoSesionesUsuario(),
        ],
      })) as [number, string?];

      const [estado, idUsuario] = respuesta;
      if (estado === 1) {
        return { estado: 'rotado', idUsuario: Number(idUsuario), sid, refreshToken: nuevo };
      }
      if (estado === -1) return { estado: 'reutilizado', idUsuario: Number(idUsuario), sid };
      return { estado: 'invalido' };
    });
  },

  /** Termina una sesión (logout, usuario desactivado al renovar). */
  revocarFamilia(sid: string, idUsuario: number): Promise<void> {
    return enRedis(async () => {
      await redis
        .multi()
        .del(claves.sesionFamilia(sid))
        .sRem(claves.sesionesUsuario(idUsuario), sid)
        .exec();
    });
  },

  /**
   * Termina todas las sesiones del usuario (desactivación, cambio de rol) o todas menos
   * `exceptoSid` (cambio de contraseña). Devuelve cuántas terminó.
   */
  revocarTodasDelUsuario(idUsuario: number, exceptoSid = ''): Promise<number> {
    return enRedis(async () => {
      const borradas = await redis.eval(SCRIPT_REVOCAR_USUARIO, {
        keys: [claves.sesionesUsuario(idUsuario)],
        arguments: [claves.prefijoSesionFamilia(), exceptoSid],
      });
      return Number(borradas);
    });
  },
};
