import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sucursalesApi, sucursalesPublicasApi } from '../../services/api/sucursales';
import type { DatosSucursal } from '../../types/sucursales';

export const CLAVE_SUCURSALES_GESTION = ['gestion', 'sucursales'] as const;
export const CLAVE_SUCURSALES_PUBLICAS = ['catalogo', 'sucursales'] as const;

type Params = Record<string, string | number | undefined>;

/** Sucursales activas para el retiro en el checkout. */
export function useSucursalesPublicas() {
  return useQuery({
    queryKey: CLAVE_SUCURSALES_PUBLICAS,
    queryFn: sucursalesPublicasApi.listar,
    staleTime: 5 * 60_000,
  });
}

export function useSucursalesGestion(params: Params) {
  return useQuery({
    queryKey: [...CLAVE_SUCURSALES_GESTION, params],
    queryFn: () => sucursalesApi.listar(params),
    placeholderData: keepPreviousData,
  });
}

function useMutacionSucursal<V, R>(fn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_SUCURSALES_GESTION });
      void queryClient.invalidateQueries({ queryKey: CLAVE_SUCURSALES_PUBLICAS });
    },
  });
}

export const useCrearSucursal = () =>
  useMutacionSucursal((datos: DatosSucursal) => sucursalesApi.crear(datos));
export const useActualizarSucursal = () =>
  useMutacionSucursal(({ id, datos }: { id: number; datos: DatosSucursal }) =>
    sucursalesApi.actualizar(id, datos),
  );
export const useCambiarEstadoSucursal = () =>
  useMutacionSucursal(({ id, activo }: { id: number; activo: boolean }) =>
    sucursalesApi.cambiarEstado(id, activo),
  );
export const useEliminarSucursal = () =>
  useMutacionSucursal((id: number) => sucursalesApi.eliminar(id));
