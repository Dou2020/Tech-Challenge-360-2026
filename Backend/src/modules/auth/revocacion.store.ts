/**
 * Revocación inmediata de access tokens (aún no vencidos) en Redis:
 *
 *   shopcart:auth:revocado:jti:{jti}          el token con ese jti (logout); TTL = vida restante
 *   shopcart:auth:revocado-desde:{idUsuario}  segundo Unix: se rechazan los tokens emitidos antes;
 *                                             TTL = vida del access token
 *
 * Además un access token solo vale mientras exista su sesión (shopcart:sesion:familia:{sid}):
 * al terminar la sesión por logout, reutilización del refresh o revocación del usuario, sus
 * access tokens dejan de aceptarse aunque no hayan vencido.
 *
 * Fail-closed: si Redis falla, las funciones lanzan 503 SERVICIO_NO_DISPONIBLE.
 */
import { redis } from '../../config/redis.js';
import { claves } from '../../shared/cache/claves.js';
import { enRedis } from './redisFailClosed.js';
import { sesionesStore } from './sesiones.store.js';
import { DURACION_ACCESS_SEG, type ClaimsAccessToken } from './tokens.js';

const ahoraSeg = () => Math.floor(Date.now() / 1000);

export const revocacionStore = {
  /** Revoca un access token hasta que venza (logout). */
  revocarAccessToken(jti: string, expiraSeg: number): Promise<void> {
    const restante = expiraSeg - ahoraSeg();
    if (restante <= 0) return Promise.resolve();
    return enRedis(async () => {
      await redis.set(claves.revocadoJti(jti), '1', { EX: restante });
    });
  },

  /**
   * Rechaza los access tokens del usuario emitidos en segundos anteriores al actual.
   * Lo complementa la verificación de la sesión: los tokens de las sesiones borradas
   * se rechazan aunque se hayan emitido en el mismo segundo.
   */
  revocarEmitidosAntes(idUsuario: number): Promise<void> {
    return enRedis(async () => {
      await redis.set(claves.revocadoDesde(idUsuario), String(ahoraSeg()), {
        EX: DURACION_ACCESS_SEG,
      });
    });
  },

  /**
   * Corta todo el acceso del usuario: sus sesiones y sus access tokens vigentes.
   * Para desactivación y cambio de rol; en cambio de contraseña se pasa `exceptoSid` para
   * conservar la sesión actual (el frontend renueva su access token con el refresh).
   * Llamar después de que el SP confirmó el cambio en la base.
   */
  async revocarAccesoDelUsuario(idUsuario: number, exceptoSid?: string): Promise<void> {
    await sesionesStore.revocarTodasDelUsuario(idUsuario, exceptoSid);
    await revocacionStore.revocarEmitidosAntes(idUsuario);
  },

  /** true si el access token fue revocado o su sesión ya terminó. */
  estaRevocado(claims: ClaimsAccessToken): Promise<boolean> {
    return enRedis(async () => {
      const [jtiRevocado, revocadoDesde, sesionActiva] = (await redis
        .multi()
        .exists(claves.revocadoJti(claims.jti))
        .get(claves.revocadoDesde(claims.idUsuario))
        .exists(claves.sesionFamilia(claims.sid))
        .exec()) as unknown as [number, string | null, number];

      if (jtiRevocado === 1 || sesionActiva === 0) return true;
      return revocadoDesde !== null && claims.iat < Number(revocadoDesde);
    });
  },
};
