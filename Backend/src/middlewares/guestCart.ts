import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../shared/errors/AppError.js';

export const HEADER_CARRITO = 'X-Cart-Token';

const esquemaToken = z.uuid();

/**
 * Lee el header opcional `X-Cart-Token` del carrito de invitado y lo deja en minúsculas en
 * `req.tokenCarrito`. No exige nada: si no viene, el carrito decide por `req.usuario`
 * (cliente) o crea uno nuevo de invitado. Va después de `authenticateOpcional`.
 *  - Viene pero no es un UUID (o viene repetido) → 400 VALIDACION con el detalle del campo.
 */
export const guestCart: RequestHandler = (req, _res, next) => {
  const valor = req.get(HEADER_CARRITO);
  if (valor === undefined || valor.trim() === '') {
    next();
    return;
  }

  const token = valor.trim().toLowerCase();
  if (!esquemaToken.safeParse(token).success) {
    throw new AppError('VALIDACION', 'La solicitud tiene datos inválidos.', [
      { field: HEADER_CARRITO, message: 'Debe ser un UUID.' },
    ]);
  }

  req.tokenCarrito = token;
  next();
};
