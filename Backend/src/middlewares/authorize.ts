import type { RequestHandler } from 'express';
import { AppError } from '../shared/errors/AppError.js';
import type { Rol } from '../shared/types/express.js';

/**
 * Permite solo los roles indicados. Va después de `authenticate`.
 * Sin usuario autenticado → 401 NO_AUTENTICADO; rol sin permiso → 403 PROHIBIDO.
 */
export function authorize(...roles: [Rol, ...Rol[]]): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario) {
      next(new AppError('NO_AUTENTICADO', 'Falta el token de acceso.'));
      return;
    }
    if (!roles.includes(req.usuario.rol)) {
      next(new AppError('PROHIBIDO', 'No tienes permiso para realizar esta acción.'));
      return;
    }
    next();
  };
}
