import { useQuery } from '@tanstack/react-query';
import { sistemaApi } from '../../services/api/sistema';

export function useEstadoSistema() {
  return useQuery({
    queryKey: ['sistema', 'estado'],
    queryFn: sistemaApi.obtenerEstado,
    refetchInterval: 30_000,
  });
}
