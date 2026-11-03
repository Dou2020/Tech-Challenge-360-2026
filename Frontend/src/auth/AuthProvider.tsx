import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../services/api/auth';
import { carritoApi } from '../services/api/carrito';
import type { EstadoSesion, RespuestaLogin, Usuario } from '../types/auth';
import { guestCart } from '../utils/guestCart';
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

  // Tras autenticarse: guarda el token, publica al usuario y fusiona el carrito de invitado.
  const abrirSesion = useCallback(
    async (respuesta: RespuestaLogin) => {
      tokenStore.set(respuesta.accessToken);
      setUsuario(respuesta.usuario);
      setEstado('autenticado');

      const tokenInvitado = guestCart.obtener();
      if (tokenInvitado && respuesta.usuario.rol === 'Cliente') {
        try {
          await carritoApi.fusionar(tokenInvitado);
          guestCart.borrar();
        } catch {
          // Si la fusión falla se conserva el token para no perder el carrito de invitado.
        }
        void queryClient.invalidateQueries({ queryKey: ['carrito'] });
      }
      return respuesta.usuario;
    },
    [queryClient],
  );

  const iniciarSesion = useCallback(
    async (correo: string, contrasena: string) =>
      abrirSesion(await authApi.login(correo, contrasena)),
    [abrirSesion],
  );

  const actualizarUsuario = useCallback(
    (cambios: Partial<Pick<Usuario, 'nombre' | 'apellido'>>) =>
      setUsuario((actual) => (actual ? { ...actual, ...cambios } : actual)),
    [],
  );

  const cerrarSesion = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Cierre de mejor esfuerzo: si el servidor no responde, la sesión local se limpia igual.
    } finally {
      terminarSesion();
    }
  }, [terminarSesion]);

  const valor = useMemo<ContextoAuth>(
    () => ({ usuario, estado, iniciarSesion, actualizarUsuario, cerrarSesion }),
    [usuario, estado, iniciarSesion, actualizarUsuario, cerrarSesion],
  );

  return <AuthContext value={valor}>{children}</AuthContext>;
}
