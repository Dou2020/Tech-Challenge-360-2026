import { useQuery } from '@tanstack/react-query';
import { catalogoApi } from '../../services/api/catalogo';

/** Detalle de un producto. La existencia viene de la base en cada petición, sin caché propia. */
export function useProducto(idProducto: number) {
  return useQuery({
    queryKey: ['catalogo', 'producto', idProducto],
    queryFn: () => catalogoApi.producto(idProducto),
    enabled: Number.isInteger(idProducto) && idProducto > 0,
    staleTime: 0,
  });
}
