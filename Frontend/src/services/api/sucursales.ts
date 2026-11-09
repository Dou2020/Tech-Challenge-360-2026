import type { Page } from '../../types/api';
import type { DatosSucursal, SucursalGestion, SucursalPublica } from '../../types/sucursales';
import { request } from '../http';
import { construirQuery } from './consulta';

type Params = Record<string, string | number | undefined>;

/** Sucursales activas para elegir el retiro (público). */
export const sucursalesPublicasApi = {
  listar: () => request<SucursalPublica[]>('/catalogo/sucursales'),
};

/** Gestión de sucursales (Administrador). */
export const sucursalesApi = {
  listar: (params: Params) =>
    request<Page<SucursalGestion>>(`/sucursales${construirQuery(params)}`),
  obtener: (id: number) => request<SucursalGestion>(`/sucursales/${id}`),
  crear: (datos: DatosSucursal) =>
    request<SucursalGestion>('/sucursales', { method: 'POST', body: datos }),
  actualizar: (id: number, datos: DatosSucursal) =>
    request<SucursalGestion>(`/sucursales/${id}`, { method: 'PUT', body: datos }),
  cambiarEstado: (id: number, activo: boolean) =>
    request<SucursalGestion>(`/sucursales/${id}/estado`, { method: 'PATCH', body: { activo } }),
  eliminar: (id: number) => request<void>(`/sucursales/${id}`, { method: 'DELETE' }),
};
