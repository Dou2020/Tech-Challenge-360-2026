import type { Carrito } from '../../types/carrito';
import { guestCart } from '../../utils/guestCart';
import { request } from '../http';

/** Endpoints de /api/carrito. El token de invitado viaja en X-Cart-Token (el backend lo ignora con sesión). */
export const carritoApi = {
  obtener: () => request<Carrito>('/carrito', { headers: guestCart.cabeceras() }),

  /** Agrega una variante. Si la API devuelve `tokenInvitado`, se guarda para las siguientes peticiones. */
  async agregarItem(idVariante: number, cantidad: number): Promise<Carrito> {
    const carrito = await request<Carrito>('/carrito/items', {
      method: 'POST',
      body: { idVariante, cantidad },
      headers: guestCart.cabeceras(),
    });
    if (carrito.tokenInvitado) guestCart.guardar(carrito.tokenInvitado);
    return carrito;
  },

  actualizarCantidad: (idVariante: number, cantidad: number) =>
    request<Carrito>(`/carrito/items/${idVariante}`, {
      method: 'PATCH',
      body: { cantidad },
      headers: guestCart.cabeceras(),
    }),

  eliminarItem: (idVariante: number) =>
    request<Carrito>(`/carrito/items/${idVariante}`, {
      method: 'DELETE',
      headers: guestCart.cabeceras(),
    }),

  vaciar: () => request<Carrito>('/carrito', { method: 'DELETE', headers: guestCart.cabeceras() }),

  /** Solo Cliente. Un cupón inválido responde 422 con el código del motivo. */
  aplicarCupon: (codigo: string) =>
    request<Carrito>('/carrito/cupon', { method: 'POST', body: { codigo } }),

  /** Solo Cliente. */
  quitarCupon: () => request<Carrito>('/carrito/cupon', { method: 'DELETE' }),

  /** Pasa el carrito de invitado al del Cliente (requiere sesión). */
  fusionar: (tokenInvitado: string) =>
    request<Carrito>('/carrito/fusionar', { method: 'POST', body: { tokenInvitado } }),
};
