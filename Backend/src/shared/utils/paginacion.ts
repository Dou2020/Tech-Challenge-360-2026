import sql from 'mssql';
import { z } from 'zod';
import type { ParametroSp, ResultadoSp } from '../../db/executeSp.js';

export const TAMANO_PAGINA_MAXIMO = 100;

export interface Paginacion {
  page: number;
  pageSize: number;
  /** `campo:asc` o `campo:desc`, ya validado contra la lista blanca del endpoint. */
  sort: string;
}

export interface RespuestaPaginada<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Campos de query comunes a todos los listados (`page`, `pageSize`, `sort`).
 * Se mezclan con los filtros del endpoint: `z.object({ q: ..., ...camposPaginacion(['nombre'], 'nombre:asc') })`.
 */
export function camposPaginacion<const C extends string>(
  camposOrden: readonly [C, ...C[]],
  ordenPorDefecto: `${C}:${'asc' | 'desc'}`,
) {
  const permitidos = new Set(camposOrden.flatMap((campo) => [`${campo}:asc`, `${campo}:desc`]));
  return {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(TAMANO_PAGINA_MAXIMO).default(20),
    sort: z
      .string()
      .refine((valor) => permitidos.has(valor), {
        message: `Usa campo:asc o campo:desc con uno de estos campos: ${camposOrden.join(', ')}.`,
      })
      .default(ordenPorDefecto),
  };
}

/** Parámetros @Pagina, @TamanoPagina y @Orden que reciben todos los SPs de listado. */
export function parametrosPaginacion({ page, pageSize, sort }: Paginacion): ParametroSp[] {
  return [
    { nombre: 'Pagina', tipo: sql.Int, valor: page },
    { nombre: 'TamanoPagina', tipo: sql.Int, valor: pageSize },
    { nombre: 'Orden', tipo: sql.NVarChar(50), valor: sort },
  ];
}

/**
 * Arma `{ items, page, pageSize, total }` con el resultado de un SP de listado:
 * el primer result set son las filas y el segundo trae una fila con `Total`.
 */
export function respuestaPaginada<F, T = F>(
  resultado: ResultadoSp<F>,
  { page, pageSize }: Paginacion,
  mapear: (fila: F) => T = (fila) => fila as unknown as T,
): RespuestaPaginada<T> {
  const filaTotal = resultado.resultSets[1]?.[0] as { Total?: number } | undefined;
  return {
    items: resultado.filas.map(mapear),
    page,
    pageSize,
    total: filaTotal?.Total ?? 0,
  };
}
