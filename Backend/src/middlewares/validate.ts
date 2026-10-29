import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../shared/errors/AppError.js';

interface Esquemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

/**
 * Valida body, query y params con esquemas zod.
 * Los valores validados (con coerciones y defaults) quedan en res.locals.validado.
 * Si algo falla responde 400 VALIDACION con el detalle por campo.
 */
export function validate(esquemas: Esquemas): RequestHandler {
  return (req, res, next) => {
    const validado: Record<string, unknown> = {};
    const detalles: { field: string; message: string }[] = [];

    for (const parte of ['params', 'query', 'body'] as const) {
      const esquema = esquemas[parte];
      if (!esquema) continue;
      const resultado = esquema.safeParse(req[parte]);
      if (resultado.success) {
        validado[parte] = resultado.data;
      } else {
        for (const issue of resultado.error.issues) {
          detalles.push({
            field: issue.path.length > 0 ? issue.path.join('.') : parte,
            message: issue.message,
          });
        }
      }
    }

    if (detalles.length > 0) {
      next(new AppError('VALIDACION', 'La solicitud tiene datos inválidos.', detalles));
      return;
    }
    res.locals.validado = validado;
    next();
  };
}
