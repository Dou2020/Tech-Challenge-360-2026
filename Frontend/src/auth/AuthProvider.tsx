import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../services/api/auth';
import type { EstadoSesion, Usuario } from '../types/auth';
import { AuthContext, type ContextoAuth } from './authContext';
import { tokenStore } from './tokenStore';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [estado, setEstado] = useState<EstadoSesion>('cargando');

  const terminarSesion = useCallback(() => {
    tokenStore.clear();
    setUsuario(null);
    setEstado('anonimo');
    queryClient.clear();
  }, [queryClient]);

  // Al cargar la página, la cookie de refresh (si existe) restaura la sesión.
  useEffect(() => {
    let activo = true;
    async function restaurar() {
      try {
        if (await authApi.renovar()) {
          const actual = await authApi.me();
          if (activo) {
            setUsuario(actual);
            setEstado('autenticado');
          }
          return;
        }
      } catch {
        // Sin sesión válida: se continúa como anónimo.
      }
      if (activo) setEstado('anonimo');
    }
    void restaurar();
    const desuscribir = tokenStore.onSesionExpirada(terminarSesion);
    return () => {
      activo = false;
      desuscribir();
    };
  }, [terminarSesion]);

  const iniciarSesion = useCallback(async (correo: string, contrasena: string) => {
    const respuesta = await authApi.login(correo, contrasena);
    tokenStore.set(respuesta.accessToken);
    setUsuario(respuesta.usuario);
    setEstado('autenticado');
    return respuesta.usuario;
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      terminarSesion();
    }
  }, [terminarSesion]);

  const valor = useMemo<ContextoAuth>(
    () => ({ usuario, estado, iniciarSesion, cerrarSesion }),
    [usuario, estado, iniciarSesion, cerrarSesion],
  );

  return <AuthContext value={valor}>{children}</AuthContext>;
}
