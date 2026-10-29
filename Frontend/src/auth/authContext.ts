import { createContext } from 'react';
import type { EstadoSesion, Usuario } from '../types/auth';

export interface ContextoAuth {
  usuario: Usuario | null;
  estado: EstadoSesion;
  iniciarSesion: (correo: string, contrasena: string) => Promise<Usuario>;
  cerrarSesion: () => Promise<void>;
}

export const AuthContext = createContext<ContextoAuth | null>(null);
