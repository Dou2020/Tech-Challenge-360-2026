import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

interface Opciones<F extends string> {
  /** Nombres de los filtros que viven en la URL. */
  filtros: readonly F[];
  /** Orden inicial, "campo:asc" o "campo:desc". */
  sortPorDefecto?: string;
  pageSizePorDefecto?: number;
}

const TAMANO_MAXIMO = 100;

function entero(valor: string | null, porDefecto: number, maximo = Infinity): number {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 ? Math.min(numero, maximo) : porDefecto;
}

/**
 * Estado de una tabla o listado en la URL (?page=2&size=20&sort=precio:desc&q=…).
 * La paginación, el orden y los filtros los resuelve el servidor: `params` es lo que se envía a la API.
 */
export function useServerTable<F extends string>({
  filtros,
  sortPorDefecto,
  pageSizePorDefecto = 20,
}: Opciones<F>) {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = entero(searchParams.get('page'), 1);
  const pageSize = entero(searchParams.get('size'), pageSizePorDefecto, TAMANO_MAXIMO);
  const sort = searchParams.get('sort') ?? sortPorDefecto;

  const valores = useMemo(
    () =>
      Object.fromEntries(filtros.map((f) => [f, searchParams.get(f) ?? ''])) as Record<F, string>,
    [filtros, searchParams],
  );

  // Cambia parámetros conservando el resto; un valor vacío se quita de la URL.
  const actualizar = useCallback(
    (cambios: Record<string, string | number | undefined>, reiniciarPagina: boolean) => {
      setSearchParams((previos) => {
        const siguientes = new URLSearchParams(previos);
        for (const [clave, valor] of Object.entries(cambios)) {
          if (valor === undefined || valor === '') siguientes.delete(clave);
          else siguientes.set(clave, String(valor));
        }
        if (reiniciarPagina) siguientes.delete('page');
        return siguientes;
      });
    },
    [setSearchParams],
  );

  const setPage = useCallback((nueva: number) => actualizar({ page: nueva }, false), [actualizar]);
  const setPageSize = useCallback(
    (nuevo: number) => actualizar({ size: nuevo }, true),
    [actualizar],
  );
  const setSort = useCallback((nuevo: string) => actualizar({ sort: nuevo }, true), [actualizar]);
  /** Cambia uno o varios filtros y vuelve a la página 1. */
  const setFiltros = useCallback(
    (cambios: Partial<Record<F, string>>) => actualizar(cambios, true),
    [actualizar],
  );
  const limpiarFiltros = useCallback(
    () => actualizar(Object.fromEntries(filtros.map((f) => [f, undefined])), true),
    [actualizar, filtros],
  );

  /** Parámetros listos para la API: sin filtros vacíos. */
  const params = useMemo(() => {
    const salida: Record<string, string | number> = { page, pageSize };
    if (sort) salida.sort = sort;
    for (const f of filtros) if (valores[f] !== '') salida[f] = valores[f];
    return salida;
  }, [page, pageSize, sort, filtros, valores]);

  return {
    page,
    pageSize,
    sort,
    filtros: valores,
    params,
    setPage,
    setPageSize,
    setSort,
    setFiltros,
    limpiarFiltros,
  };
}
