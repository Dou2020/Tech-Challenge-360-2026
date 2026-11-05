import type { Page } from '../../types/api';
import type {
  Cupon,
  DatosCupon,
  DatosUsuarioEdicion,
  DatosUsuarioNuevo,
  EntradaBitacora,
  ParametroConfiguracion,
  UsoCupon,
  UsuarioAdmin,
} from '../../types/administracion';
import type { RespuestaMensaje } from '../../types/auth';
import { request } from '../http';
import { construirQuery } from './consulta';

type Params = Record<string, string | number | undefined>;

export const cuponesApi = {
  listar: (params: Params) => request<Page<Cupon>>(`/cupones${construirQuery(params)}`),
  obtener: (id: number) => request<Cupon>(`/cupones/${id}`),
  crear: (datos: DatosCupon) => request<Cupon>('/cupones', { method: 'POST', body: datos }),
  actualizar: (id: number, datos: DatosCupon) =>
    request<Cupon>(`/cupones/${id}`, { method: 'PUT', body: datos }),
  cambiarEstado: (id: number, activo: boolean) =>
    request<Cupon>(`/cupones/${id}/estado`, { method: 'PATCH', body: { activo } }),
  eliminar: (id: number) => request<void>(`/cupones/${id}`, { method: 'DELETE' }),
  usos: (id: number, params: Params) =>
    request<Page<UsoCupon>>(`/cupones/${id}/usos${construirQuery(params)}`),
};

export const usuariosApi = {
  listar: (params: Params) => request<Page<UsuarioAdmin>>(`/usuarios${construirQuery(params)}`),
  crear: (datos: DatosUsuarioNuevo) =>
    request<UsuarioAdmin>('/usuarios', { method: 'POST', body: datos }),
  actualizar: (id: number, datos: DatosUsuarioEdicion) =>
    request<UsuarioAdmin>(`/usuarios/${id}`, { method: 'PUT', body: datos }),
  cambiarEstado: (id: number, activo: boolean) =>
    request<UsuarioAdmin>(`/usuarios/${id}/estado`, { method: 'PATCH', body: { activo } }),
  /** Reenvía el correo para crear la contraseña (409 si ya la creó, 403 si está inactivo). */
  reenviarInvitacion: (id: number) =>
    request<RespuestaMensaje>(`/usuarios/${id}/invitacion`, { method: 'POST' }),
};

export const bitacoraApi = {
  listar: (params: Params) => request<Page<EntradaBitacora>>(`/bitacora${construirQuery(params)}`),
  modulos: () => request<string[]>('/bitacora/modulos'),
};

export const configuracionApi = {
  listar: () => request<ParametroConfiguracion[]>('/configuracion'),
  actualizar: (clave: string, valor: string) =>
    request<ParametroConfiguracion>(`/configuracion/${clave}`, {
      method: 'PUT',
      body: { valor },
    }),
};
