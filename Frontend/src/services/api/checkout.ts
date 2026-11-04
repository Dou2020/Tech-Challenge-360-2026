import type { PedidoCreado, ResumenCheckout, SolicitudPago } from '../../types/checkout';
import { request } from '../http';
import { construirQuery } from './consulta';

/** Endpoints de /api/checkout (solo Cliente). */
export const checkoutApi = {
  /** Reserva la existencia 15 minutos y devuelve el resumen final. */
  iniciar: (idDireccion: number, idMetodoEnvio: number) =>
    request<ResumenCheckout>('/checkout/iniciar', {
      method: 'POST',
      body: { idDireccion, idMetodoEnvio },
    }),

  /** Retoma el checkout tras recargar. Sin reserva vigente responde 409 RESERVA_VENCIDA. */
  obtenerResumen: (idMetodoEnvio: number) =>
    request<ResumenCheckout>(`/checkout${construirQuery({ idMetodoEnvio })}`),

  /** Libera la reserva (204). */
  liberarReserva: () => request<void>('/checkout/reserva', { method: 'DELETE' }),

  /** Pago idempotente: la misma clave devuelve el mismo pedido (200) en vez de crear otro. */
  pagar: (solicitud: SolicitudPago, claveIdempotencia: string) =>
    request<PedidoCreado>('/checkout/pagar', {
      method: 'POST',
      body: solicitud,
      headers: { 'Idempotency-Key': claveIdempotencia },
    }),
};
