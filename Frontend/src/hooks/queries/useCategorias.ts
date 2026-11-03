import { useQuery } from '@tanstack/react-query';
import { catalogoApi } from '../../services/api/catalogo';

export function useCategorias() {
  return useQuery({
    queryKey: ['catalogo', 'categorias'],
    queryFn: catalogoApi.categorias,
    staleTime: 5 * 60_000,
  });
}
