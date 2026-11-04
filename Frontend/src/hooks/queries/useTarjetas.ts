import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tarjetasApi } from '../../services/api/tarjetas';
import type { DatosTarjeta } from '../../types/tarjetas';

export const CLAVE_TARJETAS = ['tarjetas'] as const;

export function useTarjetas(habilitado = true) {
  return useQuery({ queryKey: CLAVE_TARJETAS, queryFn: tarjetasApi.listar, enabled: habilitado });
}

export function useCrearTarjeta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosTarjeta) => tarjetasApi.crear(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_TARJETAS }),
  });
}

export function useMarcarTarjetaPredeterminada() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tarjetasApi.marcarPredeterminada(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_TARJETAS }),
  });
}

export function useEliminarTarjeta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tarjetasApi.eliminar(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_TARJETAS }),
  });
}
