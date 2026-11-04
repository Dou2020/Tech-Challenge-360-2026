import { useQuery } from '@tanstack/react-query';
import { catalogoApi } from '../../services/api/catalogo';

export function useMetodosEnvio() {
  return useQuery({
    queryKey: ['catalogo', 'metodos-envio'],
    queryFn: catalogoApi.metodosEnvio,
    staleTime: 5 * 60_000,
  });
}
