/** Arma el query string de un listado; omite los valores vacíos. */
export function construirQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== '') consulta.set(clave, String(valor));
  }
  const texto = consulta.toString();
  return texto ? `?${texto}` : '';
}
