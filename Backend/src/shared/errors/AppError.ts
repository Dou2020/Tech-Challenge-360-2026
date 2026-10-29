import { CODIGOS_ERROR, type CodigoError } from './codigos.js';

export interface DetalleError {
  field: string;
  message: string;
}

export interface OpcionesError {
  /** Segundos para el header Retry-After (429 CUENTA_BLOQUEADA, DEMASIADAS_SOLICITUDES). */
  retryAfterSeg?: number;
}

/** Error de negocio o de solicitud que el errorHandler convierte en respuesta HTTP. */
export class AppError extends Error {
  readonly code: CodigoError;
  readonly status: number;
  readonly details: DetalleError[] | undefined;
  readonly retryAfterSeg: number | undefined;

  constructor(
    code: CodigoError,
    message: string,
    details?: DetalleError[],
    opciones: OpcionesError = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = CODIGOS_ERROR[code].http;
    this.details = details;
    this.retryAfterSeg = opciones.retryAfterSeg;
  }
}
