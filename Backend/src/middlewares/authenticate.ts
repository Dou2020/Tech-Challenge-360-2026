import type { RequestHandler } from 'express';
import { revocacionStore } from '../modules/auth/revocacion.store.js';
import { extraerBearer, verificarAccessToken } from '../modules/auth/tokens.js';
import { AppError } from '../shared/errors/AppError.js';
import type { UsuarioAutenticado } from '../shared/types/express.js';

/**
 * Verifica el header Authorization y devuelve el usuario del token.
 * Lógica común de `authenticate` y `authenticateOpcional`.
 */
async function usuarioDelHeader(header: string | undefined): Promise<UsuarioAutenticado> {
  const token = extraerBearer(header);
  if (!token) throw new AppError('NO_AUTENTICADO', 'Falta el token de acceso.');

  const claims = verificarAccessToken(token);
  if (await revocacionStore.estaRevocado(claims)) {
    throw new AppError('NO_AUTENTICADO', 'La sesión fue cerrada o revocada.');
  }

  return {
    idUsuario: claims.idUsuario,
    rol: claims.rol,
    jti: claims.jti,
    sid: claims.sid,
    iat: claims.iat,
    exp: claims.exp,
  };
}

/**
 * Exige un access token válido en `Authorization: Bearer <token>` y deja `req.usuario`.
 *  - Sin token, firma inválida o token ajeno → 401 NO_AUTENTICADO.
 *  - Vencido → 401 TOKEN_EXPIRADO (el frontend renueva y reintenta).
 *  - Revocado en Redis (logout, sesión terminada, usuario revocado) → 401 NO_AUTENTICADO.
 *  - Redis no responde → 503 SERVICIO_NO_DISPONIBLE: fail-closed, no se deja pasar un token
 *    cuya revocación no se pudo comprobar.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  req.usuario = await usuarioDelHeader(req.headers.authorization);
  next();
};

/**
 * Para rutas Invitado/Cliente (carrito): sin header Authorization sigue como invitado,
 * sin `req.usuario`. Si el header viene, se valida igual que en `authenticate`
 * (401 NO_AUTENTICADO / TOKEN_EXPIRADO, 503 si Redis no responde): un token inválido
 * nunca degrada en silencio a invitado.
 */
export const authenticateOpcional: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (header === undefined || header.trim() === '') {
    next();
    return;
  }
  req.usuario = await usuarioDelHeader(header);
  next();
};
