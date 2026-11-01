import type { RequestHandler } from 'express';
import { revocacionStore } from '../modules/auth/revocacion.store.js';
import { extraerBearer, verificarAccessToken } from '../modules/auth/tokens.js';
import { AppError } from '../shared/errors/AppError.js';

/**
 * Exige un access token válido en `Authorization: Bearer <token>` y deja `req.usuario`.
 *  - Sin token, firma inválida o token ajeno → 401 NO_AUTENTICADO.
 *  - Vencido → 401 TOKEN_EXPIRADO (el frontend renueva y reintenta).
 *  - Revocado en Redis (logout, sesión terminada, usuario revocado) → 401 NO_AUTENTICADO.
 *  - Redis no responde → 503 SERVICIO_NO_DISPONIBLE: fail-closed, no se deja pasar un token
 *    cuya revocación no se pudo comprobar.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = extraerBearer(req.headers.authorization);
  if (!token) throw new AppError('NO_AUTENTICADO', 'Falta el token de acceso.');

  const claims = verificarAccessToken(token);
  if (await revocacionStore.estaRevocado(claims)) {
    throw new AppError('NO_AUTENTICADO', 'La sesión fue cerrada o revocada.');
  }

  req.usuario = {
    idUsuario: claims.idUsuario,
    rol: claims.rol,
    jti: claims.jti,
    sid: claims.sid,
  };
  next();
};
