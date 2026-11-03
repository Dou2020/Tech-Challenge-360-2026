/** ¿Falló la descarga de un chunk lazy (p. ej. tras un despliegue nuevo o sin red)? */
export function esErrorDeCarga(error: unknown): boolean {
  const mensaje = error instanceof Error ? `${error.name} ${error.message}` : '';
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(
    mensaje,
  );
}
