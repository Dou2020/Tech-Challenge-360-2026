import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { reportesApi } from '../../services/api/reportes';
import type { Agrupacion } from '../../types/reportes';

export const CLAVE_REPORTES = ['reportes'] as const;

type Rango = { desde?: string | undefined; hasta?: string | undefined };

/** `habilitado` es false mientras el rango sea inválido: la API respondería 400. */
export function useResumenReportes(rango: Rango, habilitado = true) {
  return useQuery({
    queryKey: [...CLAVE_REPORTES, 'resumen', rango],
    queryFn: () => reportesApi.resumen(rango),
    enabled: habilitado,
  });
}

export function useVentasPorPeriodo(rango: Rango, agrupacion: Agrupacion, habilitado = true) {
  return useQuery({
    queryKey: [...CLAVE_REPORTES, 'ventas', rango, agrupacion],
    queryFn: () => reportesApi.ventas({ ...rango, agrupacion }),
    enabled: habilitado,
  });
}

export function useVentasPorCategoria(rango: Rango, habilitado = true) {
  return useQuery({
    queryKey: [...CLAVE_REPORTES, 'categorias', rango],
    queryFn: () => reportesApi.ventasPorCategoria(rango),
    enabled: habilitado,
  });
}

export function useProductosMasVendidos(rango: Rango, limite = 10, habilitado = true) {
  return useQuery({
    queryKey: [...CLAVE_REPORTES, 'top', rango, limite],
    queryFn: () => reportesApi.productosMasVendidos({ ...rango, limite }),
    enabled: habilitado,
  });
}

export function useCarritosAbandonados(
  params: Record<string, string | number | undefined>,
  habilitado = true,
) {
  return useQuery({
    queryKey: [...CLAVE_REPORTES, 'carritos', params],
    queryFn: () => reportesApi.carritosAbandonados(params),
    enabled: habilitado,
    placeholderData: keepPreviousData,
  });
}
