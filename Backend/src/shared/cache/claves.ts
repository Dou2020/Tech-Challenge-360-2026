/** Prefijo de todas las claves de ShopCart en Redis. */
export const PREFIJO = 'shopcart';

/** Grupos de caché que se invalidan juntos incrementando su versión. */
export type NamespaceCache = 'reportes' | 'catalogo';

export const claves = {
  version: (namespace: NamespaceCache) => `${PREFIJO}:${namespace}:version`,
  versionada: (namespace: NamespaceCache, version: number, resto: string) =>
    `${PREFIJO}:${namespace}:v${version}:${resto}`,
  usuario: (idUsuario: number) => `${PREFIJO}:usuario:${idUsuario}`,
  metodosEnvio: () => `${PREFIJO}:checkout:metodos-envio`,
  configuracion: () => `${PREFIJO}:configuracion`,
};
