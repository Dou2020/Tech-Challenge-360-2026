import { createContext } from 'react';
import type { EstadoSesion, Usuario } from '../types/auth';

export interface ContextoAuth {
  usuario: Usuario | null;
  estado: EstadoSesion;
  iniciarSesion: (correo: string, contrasena: string) => Promise<Usuario>;
  /** Actualiza en memoria los datos visibles del usuario (p. ej. tras editar el perfil). */
  actualizarUsuario: (cambios: Partial<Pick<Usuario, 'nombre' | 'apellido'>>) => void;
  cerrarSesion: () => Promise<void>;
}

export const AuthContext = createContext<ContextoAuth | null>(null);
