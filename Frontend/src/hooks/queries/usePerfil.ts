import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth';
import { perfilApi } from '../../services/api/perfil';
import type { DatosContrasena, DatosPerfil } from '../../types/perfil';

const CLAVE = ['perfil'] as const;

export function usePerfil() {
  return useQuery({ queryKey: CLAVE, queryFn: perfilApi.obtener });
}

export function useActualizarPerfil() {
  const queryClient = useQueryClient();
  const { actualizarUsuario } = useAuth();
  return useMutation({
    mutationFn: (datos: DatosPerfil) => perfilApi.actualizar(datos),
    onSuccess: (perfil) => {
      queryClient.setQueryData(CLAVE, perfil);
      actualizarUsuario({ nombre: perfil.nombre, apellido: perfil.apellido });
    },
  });
}

export function useCambiarContrasena() {
  return useMutation({
    mutationFn: (datos: DatosContrasena) => perfilApi.cambiarContrasena(datos),
  });
}
