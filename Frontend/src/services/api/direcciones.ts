import type { DatosDireccion, Direccion } from '../../types/direcciones';
import { request } from '../http';

/** Endpoints de /api/direcciones (solo Cliente). */
export const direccionesApi = {
  listar: () => request<Direccion[]>('/direcciones'),

  obtener: (id: number) => request<Direccion>(`/direcciones/${id}`),

  crear: (datos: DatosDireccion) =>
    request<Direccion>('/direcciones', { method: 'POST', body: datos }),

  actualizar: (id: number, datos: DatosDireccion) =>
    request<Direccion>(`/direcciones/${id}`, { method: 'PUT', body: datos }),

  /** Baja lógica (204). */
  desactivar: (id: number) => request<void>(`/direcciones/${id}`, { method: 'DELETE' }),
};
