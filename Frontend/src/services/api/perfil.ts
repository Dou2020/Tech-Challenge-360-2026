import type { DatosContrasena, DatosPerfil, Perfil } from '../../types/perfil';
import { request } from '../http';

/** Endpoints de /api/perfil (cualquier rol autenticado). */
export const perfilApi = {
  obtener: () => request<Perfil>('/perfil'),

  actualizar: (datos: DatosPerfil) => request<Perfil>('/perfil', { method: 'PUT', body: datos }),

  /** 204. Una contraseña actual incorrecta responde 400 VALIDACION con details. */
  cambiarContrasena: (datos: DatosContrasena) =>
    request<void>('/perfil/contrasena', { method: 'PUT', body: datos }),
};
