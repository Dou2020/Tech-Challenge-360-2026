/** Formatos comunes de la API (ver Backend/API.md, sección Convenciones). */

export interface DetalleError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: DetalleError[];
  };
  requestId: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
