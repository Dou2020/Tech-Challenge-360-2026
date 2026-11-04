import type { DatosTarjeta, Tarjeta } from '../../types/tarjetas';
import { request } from '../http';

/** Endpoints de /api/tarjetas (solo Cliente). */
export const tarjetasApi = {
  /** Sin paginar; la predeterminada va primero. */
  listar: () => request<Tarjeta[]>('/tarjetas'),

  crear: (datos: DatosTarjeta) => request<Tarjeta>('/tarjetas', { method: 'POST', body: datos }),

  marcarPredeterminada: (id: number) =>
    request<Tarjeta>(`/tarjetas/${id}/predeterminada`, { method: 'PATCH' }),

  /** Borrado (204). */
  eliminar: (id: number) => request<void>(`/tarjetas/${id}`, { method: 'DELETE' }),
};
