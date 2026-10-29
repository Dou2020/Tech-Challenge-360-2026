import type { ErrorRequestHandler } from 'express';
import { logger } from '../config/logger.js';
import { AppError } from '../shared/errors/AppError.js';

/** Error de body-parser (express.json): trae `type` y un status 4xx. */
interface ErrorCuerpo {
  type: string;
  status: number;
}

function esErrorCuerpo(error: unknown): error is ErrorCuerpo {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { type?: unknown }).type === 'string' &&
    typeof (error as { status?: unknown }).status === 'number' &&
    (error as { status: number }).status < 500
  );
}

const MENSAJES_CUERPO: Record<string, string> = {
  'entity.parse.failed': 'El cuerpo de la solicitud no es JSON válido.',
  'entity.too.large': 'El cuerpo de la solicitud supera el tamaño permitido.',
};

/** Respuesta de error única de la API: { error: { code, message, details? }, requestId }. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = String(req.id ?? '');

  if (error instanceof AppError) {
    if (error.retryAfterSeg !== undefined) {
      res.setHeader('Retry-After', String(Math.ceil(error.retryAfterSeg)));
    }
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      requestId,
    });
    return;
  }

  // Body que express.json no pudo leer: JSON mal formado, demasiado grande, codificación no soportada…
  if (esErrorCuerpo(error)) {
    res.status(400).json({
      error: {
        code: 'VALIDACION',
        message: MENSAJES_CUERPO[error.type] ?? 'No se pudo leer el cuerpo de la solicitud.',
      },
      requestId,
    });
    return;
  }

  logger.error({ err: error, requestId }, 'Error no controlado');
  res.status(500).json({
    error: { code: 'ERROR_INTERNO', message: 'Ocurrió un error inesperado.' },
    requestId,
  });
};
