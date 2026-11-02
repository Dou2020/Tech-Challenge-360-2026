import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../shared/errors/AppError.js';

export const HEADER_IDEMPOTENCIA = 'Idempotency-Key';

const esquemaClave = z.uuid({ version: 'v4' });

/**
 * Exige el header `Idempotency-Key` con un UUID v4 (POST /api/checkout/pagar).
 * Deja la clave en minúsculas en `req.claveIdempotencia`; el SP la guarda en
 * `Pedido.ClaveIdempotencia` (UNIQUE) y decide si la petición es una repetición.
 *  - Falta el header → 400 IDEMPOTENCY_KEY_REQUERIDA.
 *  - No es un UUID v4 (o viene repetido) → 400 IDEMPOTENCY_KEY_REQUERIDA con el detalle del campo.
 */
export const idempotencyKey: RequestHandler = (req, _res, next) => {
  const valor = req.get(HEADER_IDEMPOTENCIA);
  if (valor === undefined || valor.trim() === '') {
    throw new AppError(
      'IDEMPOTENCY_KEY_REQUERIDA',
      `El pago requiere el header ${HEADER_IDEMPOTENCIA}.`,
    );
  }

  const clave = valor.trim().toLowerCase();
  if (!esquemaClave.safeParse(clave).success) {
    throw new AppError(
      'IDEMPOTENCY_KEY_REQUERIDA',
      `El header ${HEADER_IDEMPOTENCIA} debe ser un UUID v4.`,
      [{ field: HEADER_IDEMPOTENCIA, message: 'Debe ser un UUID v4.' }],
    );
  }

  req.claveIdempotencia = clave;
  next();
};
