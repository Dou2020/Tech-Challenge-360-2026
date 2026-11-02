/**
 * Catálogo de códigos de error de la API.
 * Debe coincidir con la tabla "Catálogo de códigos de error" de Backend/API.md
 * y con los THROW de los stored procedures.
 */
export const CODIGOS_ERROR = {
  VALIDACION: { http: 400, throw: 50001 },
  IDEMPOTENCY_KEY_REQUERIDA: { http: 400 },
  TOKEN_CONTRASENA_INVALIDO: { http: 400 },
  NO_AUTENTICADO: { http: 401 },
  TOKEN_EXPIRADO: { http: 401 },
  CREDENCIALES_INVALIDAS: { http: 401, throw: 50010 },
  REFRESH_INVALIDO: { http: 401, throw: 50011 },
  PAGO_RECHAZADO: { http: 402, throw: 50020 },
  PROHIBIDO: { http: 403 },
  USUARIO_INACTIVO: { http: 403, throw: 50012 },
  NO_ENCONTRADO: { http: 404, throw: 50004 },
  DUPLICADO: { http: 409 },
  CONTRASENA_YA_CREADA: { http: 409 },
  STOCK_INSUFICIENTE: { http: 409, throw: 50030 },
  RESERVA_VENCIDA: { http: 409, throw: 50031 },
  TRANSICION_NO_PERMITIDA: { http: 409, throw: 50040 },
  IDEMPOTENCIA_CONFLICTO: { http: 409, throw: 50021 },
  PRODUCTO_CON_VENTAS: { http: 409, throw: 50050 },
  EN_USO: { http: 409, throw: 50051 },
  BITACORA_INMUTABLE: { http: 409, throw: 50070 },
  KARDEX_INMUTABLE: { http: 409, throw: 50071 },
  ARCHIVO_DEMASIADO_GRANDE: { http: 413 },
  TIPO_ARCHIVO_NO_PERMITIDO: { http: 415 },
  RANGO_NO_SATISFACIBLE: { http: 416 },
  CUPON_NO_EXISTE: { http: 422, throw: 50060 },
  CUPON_INACTIVO: { http: 422, throw: 50061 },
  CUPON_NO_VIGENTE: { http: 422, throw: 50062 },
  CUPON_VENCIDO: { http: 422, throw: 50063 },
  CUPON_AGOTADO: { http: 422, throw: 50064 },
  CUPON_LIMITE_CLIENTE: { http: 422, throw: 50065 },
  CUPON_MINIMO_NO_ALCANZADO: { http: 422, throw: 50066 },
  CUPON_NO_APLICA: { http: 422, throw: 50067 },
  EXISTENCIA_NEGATIVA: { http: 422, throw: 50032 },
  CANTIDAD_DEVOLUCION_EXCEDIDA: { http: 422, throw: 50041 },
  DEMASIADAS_SOLICITUDES: { http: 429 },
  CUENTA_BLOQUEADA: { http: 429 },
  ERROR_INTERNO: { http: 500 },
  SERVICIO_NO_DISPONIBLE: { http: 503 },
} as const satisfies Record<string, { http: number; throw?: number }>;

export type CodigoError = keyof typeof CODIGOS_ERROR;

/** Código de la API que corresponde a un número de THROW de SQL Server. */
export const CODIGO_POR_THROW: ReadonlyMap<number, CodigoError> = new Map(
  Object.entries(CODIGOS_ERROR).flatMap(([codigo, definicion]) =>
    'throw' in definicion ? [[definicion.throw, codigo as CodigoError] as const] : [],
  ),
);
