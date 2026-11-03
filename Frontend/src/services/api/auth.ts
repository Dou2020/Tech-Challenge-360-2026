import type {
  DatosRegistro,
  RespuestaLogin,
  RespuestaMensaje,
  RespuestaVerificarToken,
  Usuario,
} from '../../types/auth';
import { renovarSesion, request } from '../http';

/** Endpoints de /api/auth (ver Backend/API.md). */
export const authApi = {
  login: (correo: string, contrasena: string) =>
    request<RespuestaLogin>('/auth/login', {
      method: 'POST',
      body: { correo, contrasena },
      sinRenovar: true,
    }),

  /** Registra un Cliente; responde 202 sin sesión y envía por correo el enlace para crear la contraseña. */
  registro: (datos: DatosRegistro) =>
    request<RespuestaMensaje>('/auth/registro', { method: 'POST', body: datos, sinRenovar: true }),

  /** Pide el enlace para restablecer la contraseña; responde igual exista o no la cuenta. */
  olvido: (correo: string) =>
    request<RespuestaMensaje>('/auth/contrasena/olvido', {
      method: 'POST',
      body: { correo },
      sinRenovar: true,
    }),

  /** Comprueba el token del enlace sin consumirlo. */
  verificarToken: (token: string) =>
    request<RespuestaVerificarToken>('/auth/contrasena/verificar', {
      method: 'POST',
      body: { token },
      sinRenovar: true,
    }),

  /** Fija la contraseña con el token del enlace (204, no abre sesión). */
  establecerContrasena: (token: string, contrasena: string) =>
    request<void>('/auth/contrasena/establecer', {
      method: 'POST',
      body: { token, contrasena },
      sinRenovar: true,
    }),

  renovar: renovarSesion,

  me: () => request<Usuario>('/auth/me'),

  logout: () => request<void>('/auth/logout', { method: 'POST', sinRenovar: true }),
};
