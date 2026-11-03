import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { catalogoApi } from '../../services/api/catalogo';

/** Búsqueda paginada; conserva la página anterior mientras llega la siguiente. */
export function useProductos(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['catalogo', 'productos', params],
    queryFn: () => catalogoApi.buscarProductos(params),
    placeholderData: keepPreviousData,
  });
}
