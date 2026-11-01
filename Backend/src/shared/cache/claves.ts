/** Prefijo de todas las claves de ShopCart en Redis. */
export const PREFIJO = 'shopcart';

/** Grupos de caché que se invalidan juntos incrementando su versión. */
export type NamespaceCache = 'reportes' | 'catalogo';

export const claves = {
  // --- Caché (fail-open) ---
  version: (namespace: NamespaceCache) => `${PREFIJO}:${namespace}:version`,
  versionada: (namespace: NamespaceCache, version: number, resto: string) =>
    `${PREFIJO}:${namespace}:v${version}:${resto}`,
  usuario: (idUsuario: number) => `${PREFIJO}:usuario:${idUsuario}`,
  metodosEnvio: () => `${PREFIJO}:checkout:metodos-envio`,
  configuracion: () => `${PREFIJO}:configuracion`,

  // --- Sesiones y autenticación (fail-closed) ---
  /** Hash con { idUsuario, familia } por cada refresh token emitido (también los ya rotados). */
  sesionToken: (hashToken: string) => `${PREFIJO}:sesion:token:${hashToken}`,
  /** Hash con { idUsuario, tokenActual } de la familia (sesión). Si no existe, la sesión terminó. */
  sesionFamilia: (familia: string) => `${PREFIJO}:sesion:familia:${familia}`,
  /** Set con las familias activas del usuario. */
  sesionesUsuario: (idUsuario: number) => `${PREFIJO}:sesion:usuario:${idUsuario}`,
  /** Prefijo de sesionFamilia, para los scripts Lua que arman la clave con el valor guardado. */
  prefijoSesionFamilia: () => `${PREFIJO}:sesion:familia:`,
  /** Prefijo de sesionesUsuario, para los scripts Lua. */
  prefijoSesionesUsuario: () => `${PREFIJO}:sesion:usuario:`,
  /** Access token revocado (logout); TTL = vida restante del token. */
  revocadoJti: (jti: string) => `${PREFIJO}:auth:revocado:jti:${jti}`,
  /** Segundo Unix desde el que se aceptan los access tokens del usuario. */
  revocadoDesde: (idUsuario: number) => `${PREFIJO}:auth:revocado-desde:${idUsuario}`,
  /** Intentos fallidos de login por correo. */
  intentosLogin: (correo: string) => `${PREFIJO}:auth:intentos:${correo}`,
  /** Prefijo del store de rate-limit-redis de un limitador. */
  prefijoRateLimit: (nombre: string) => `${PREFIJO}:ratelimit:${nombre}:`,
};
