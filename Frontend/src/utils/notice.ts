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

/**
 * Error al cambiar el estado de un pedido o cancelarlo. Un 409 TRANSICION_NO_PERMITIDA significa
 * que alguien más cambió el pedido: se explica claro en vez del mensaje técnico.
 */
export function avisoErrorTransicion(
  error: unknown,
  mensajePorDefecto = 'No se pudo completar la acción.',
): Aviso {
  if (error instanceof ApiError && error.code === 'TRANSICION_NO_PERMITIDA') {
    return {
      tipo: 'error',
      mensaje:
        'El pedido ya no admite ese cambio: su estado es otro. Se actualizó la información; revisa las acciones disponibles.',
      referencia: error.requestId,
    };
  }
  return errorNotice(error, mensajePorDefecto);
}
