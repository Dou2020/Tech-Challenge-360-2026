import type { RespuestaLogin, Usuario } from '../../types/auth';
import { renovarSesion, request } from '../http';

/** Endpoints de /api/auth (ver Backend/API.md). */
export const authApi = {
  login: (correo: string, contrasena: string) =>
    request<RespuestaLogin>('/auth/login', {
      method: 'POST',
      body: { correo, contrasena },
      sinRenovar: true,
    }),

  renovar: renovarSesion,

  me: () => request<Usuario>('/auth/me'),

  logout: () => request<void>('/auth/logout', { method: 'POST', sinRenovar: true }),
};
