import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { direccionesApi } from '../../services/api/direcciones';
import type { DatosDireccion } from '../../types/direcciones';

const CLAVE = ['direcciones'] as const;

export function useDirecciones(habilitado = true) {
  return useQuery({ queryKey: CLAVE, queryFn: direccionesApi.listar, enabled: habilitado });
}

export function useCrearDireccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosDireccion) => direccionesApi.crear(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useActualizarDireccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: number; datos: DatosDireccion }) =>
      direccionesApi.actualizar(id, datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE }),
  });
}

export function useEliminarDireccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => direccionesApi.desactivar(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE }),
  });
}
