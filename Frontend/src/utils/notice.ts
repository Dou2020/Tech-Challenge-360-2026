import { ApiError } from '../services/http';

export type TipoAviso = 'exito' | 'error' | 'info';

export interface Aviso {
  tipo: TipoAviso;
  mensaje: string;
  /** requestId de la API, para soporte. */
  referencia?: string | undefined;
}

export function avisoExito(mensaje: string): Aviso {
  return { tipo: 'exito', mensaje };
}

export function avisoInfo(mensaje: string): Aviso {
  return { tipo: 'info', mensaje };
}

/** Convierte cualquier error en un aviso en español; conserva el requestId de un ApiError. */
export function errorNotice(
  error: unknown,
  mensajePorDefecto = 'Ocurrió un error inesperado.',
  mensajesPorCodigo: Record<string, string> = {},
): Aviso {
  if (error instanceof ApiError) {
    return {
      tipo: 'error',
      mensaje: mensajesPorCodigo[error.code] ?? error.message,
      referencia: error.requestId,
    };
  }
  return { tipo: 'error', mensaje: mensajePorDefecto };
}
