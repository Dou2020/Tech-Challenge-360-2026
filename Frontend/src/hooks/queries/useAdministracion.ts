import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bitacoraApi,
  configuracionApi,
  cuponesApi,
  usuariosApi,
} from '../../services/api/administracion';
import type {
  DatosCupon,
  DatosUsuarioEdicion,
  DatosUsuarioNuevo,
} from '../../types/administracion';

export const CLAVE_CUPONES = ['administracion', 'cupones'] as const;
export const CLAVE_USUARIOS = ['administracion', 'usuarios'] as const;
export const CLAVE_BITACORA = ['administracion', 'bitacora'] as const;
export const CLAVE_CONFIGURACION = ['administracion', 'configuracion'] as const;

type Params = Record<string, string | number | undefined>;

// --- Cupones --------------------------------------------------------------------

export function useCupones(params: Params) {
  return useQuery({
    queryKey: [...CLAVE_CUPONES, 'lista', params],
    queryFn: () => cuponesApi.listar(params),
    placeholderData: keepPreviousData,
  });
}

export function useCupon(id: number) {
  return useQuery({
    queryKey: [...CLAVE_CUPONES, 'detalle', id],
    queryFn: () => cuponesApi.obtener(id),
    enabled: Number.isInteger(id) && id > 0,
    staleTime: 0,
  });
}

export function useUsosCupon(id: number, params: Params) {
  return useQuery({
    queryKey: [...CLAVE_CUPONES, 'usos', id, params],
    queryFn: () => cuponesApi.usos(id, params),
    enabled: Number.isInteger(id) && id > 0,
    placeholderData: keepPreviousData,
  });
}

function useMutacionCupon<V, R>(fn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_CUPONES }),
  });
}

export const useCrearCupon = () => useMutacionCupon((datos: DatosCupon) => cuponesApi.crear(datos));
export const useActualizarCupon = (id: number) =>
  useMutacionCupon((datos: DatosCupon) => cuponesApi.actualizar(id, datos));
export const useCambiarEstadoCupon = () =>
  useMutacionCupon(({ id, activo }: { id: number; activo: boolean }) =>
    cuponesApi.cambiarEstado(id, activo),
  );
export const useEliminarCupon = () => useMutacionCupon((id: number) => cuponesApi.eliminar(id));

// --- Usuarios -------------------------------------------------------------------

export function useUsuarios(params: Params) {
  return useQuery({
    queryKey: [...CLAVE_USUARIOS, params],
    queryFn: () => usuariosApi.listar(params),
    placeholderData: keepPreviousData,
  });
}

function useMutacionUsuario<V, R>(fn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_USUARIOS }),
  });
}

export const useCrearUsuario = () =>
  useMutacionUsuario((datos: DatosUsuarioNuevo) => usuariosApi.crear(datos));
export const useActualizarUsuario = () =>
  useMutacionUsuario(({ id, datos }: { id: number; datos: DatosUsuarioEdicion }) =>
    usuariosApi.actualizar(id, datos),
  );
export const useReenviarInvitacion = () =>
  useMutacionUsuario((id: number) => usuariosApi.reenviarInvitacion(id));
export const useCambiarEstadoUsuario = () =>
  useMutacionUsuario(({ id, activo }: { id: number; activo: boolean }) =>
    usuariosApi.cambiarEstado(id, activo),
  );

// --- Bitácora -------------------------------------------------------------------

export function useBitacora(params: Params) {
  return useQuery({
    queryKey: [...CLAVE_BITACORA, 'lista', params],
    queryFn: () => bitacoraApi.listar(params),
    placeholderData: keepPreviousData,
  });
}

export function useModulosBitacora() {
  return useQuery({
    queryKey: [...CLAVE_BITACORA, 'modulos'],
    queryFn: bitacoraApi.modulos,
    staleTime: 5 * 60_000,
  });
}

// --- Configuración --------------------------------------------------------------

export function useConfiguracion() {
  return useQuery({
    queryKey: CLAVE_CONFIGURACION,
    queryFn: configuracionApi.listar,
  });
}

/** Cambia un parámetro; la bitácora registra el cambio, así que también se refresca. */
export function useActualizarParametro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ clave, valor }: { clave: string; valor: string }) =>
      configuracionApi.actualizar(clave, valor),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_CONFIGURACION });
      void queryClient.invalidateQueries({ queryKey: CLAVE_BITACORA });
    },
  });
}
