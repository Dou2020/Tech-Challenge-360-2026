import { tokenStore } from '../auth/tokenStore';
import type { ApiErrorBody, DetalleError } from '../types/api';
import type { RespuestaRefresh } from '../types/auth';

export const API_URL: string = import.meta.env.VITE_API_URL ?? '/api';

/** Error de la API con el formato { error: { code, message, details }, requestId }. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: DetalleError[];
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details: DetalleError[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

function esCuerpoDeError(valor: unknown): valor is ApiErrorBody {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'error' in valor &&
    typeof (valor as ApiErrorBody).error?.code === 'string'
  );
}

async function crearApiError(respuesta: Response): Promise<ApiError> {
  const cuerpo: unknown = await respuesta.json().catch(() => undefined);
  if (esCuerpoDeError(cuerpo)) {
    const { code, message, details } = cuerpo.error;
    return new ApiError(respuesta.status, code, message, details, cuerpo.requestId);
  }
  return new ApiError(
    respuesta.status,
    'ERROR_HTTP',
    `La solicitud falló (HTTP ${respuesta.status}).`,
  );
}

// Una sola renovación en curso, compartida por todas las peticiones que recibieron 401.
let renovacionEnCurso: Promise<boolean> | null = null;

/** Pide un access token nuevo con la cookie de refresh. Devuelve false si la sesión no se puede renovar. */
export function renovarSesion(): Promise<boolean> {
  renovacionEnCurso ??= (async () => {
    try {
      const respuesta = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!respuesta.ok) return false;
      const datos = (await respuesta.json()) as RespuestaRefresh;
      tokenStore.set(datos.accessToken);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    renovacionEnCurso = null;
  });
  return renovacionEnCurso;
}

export interface OpcionesRequest extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** No intentar renovar la sesión ante un 401 (login, logout). */
  sinRenovar?: boolean;
  /** Status distintos de 2xx que se devuelven como datos (p. ej. 503 en /health). */
  estadosValidos?: number[];
}

function ejecutar(ruta: string, opciones: Omit<OpcionesRequest, 'sinRenovar' | 'estadosValidos'>) {
  const { body, headers: headersIniciales, ...resto } = opciones;
  const headers = new Headers(headersIniciales);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${API_URL}${ruta}`, {
    ...resto,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Cliente HTTP de la aplicación. Ante un 401 renueva la sesión una vez de forma
 * transparente y reintenta; si no se puede renovar, avisa que la sesión expiró.
 */
export async function request<T>(ruta: string, opciones: OpcionesRequest = {}): Promise<T> {
  const { sinRenovar = false, estadosValidos = [], ...resto } = opciones;

  let respuesta: Response;
  try {
    respuesta = await ejecutar(ruta, resto);
    if (respuesta.status === 401 && !sinRenovar) {
      if (await renovarSesion()) {
        respuesta = await ejecutar(ruta, resto);
      } else {
        tokenStore.notificarSesionExpirada();
      }
    }
  } catch {
    throw new ApiError(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.');
  }

  if (!respuesta.ok && !estadosValidos.includes(respuesta.status)) {
    throw await crearApiError(respuesta);
  }
  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}
