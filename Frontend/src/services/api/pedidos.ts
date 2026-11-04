import type { Page } from '../../types/api';
import type {
  CambioEstadoPedido,
  DatosDevolucion,
  DevolucionPedido,
  DevolucionRegistrada,
  EstadosPedido,
  PedidoDetalle,
  PedidoResumen,
} from '../../types/pedidos';
import { request } from '../http';
import { construirQuery } from './consulta';

/** Endpoints de /api/pedidos. El Cliente solo ve los suyos; el personal ve todos. */
export const pedidosApi = {
  listar: (params: Record<string, string | number | undefined>) =>
    request<Page<PedidoResumen>>(`/pedidos${construirQuery(params)}`),

  obtener: (id: number) => request<PedidoDetalle>(`/pedidos/${id}`),

  historial: (id: number) => request<CambioEstadoPedido[]>(`/pedidos/${id}/historial`),

  devoluciones: (id: number) => request<DevolucionPedido[]>(`/pedidos/${id}/devoluciones`),

  /** Cancela antes del despacho; responde el detalle actualizado. El motivo es opcional. */
  cancelar: (id: number, motivo?: string) =>
    request<PedidoDetalle>(`/pedidos/${id}/cancelar`, {
      method: 'POST',
      body: motivo ? { motivo } : {},
    }),

  /** Avanza el estado (Operador y Administrador); `comentario` es opcional. */
  cambiarEstado: (id: number, estado: string, comentario?: string) =>
    request<PedidoDetalle>(`/pedidos/${id}/estado`, {
      method: 'PATCH',
      body: comentario ? { estado, comentario } : { estado },
    }),

  /** Registra una devolución total o parcial por línea (Operador y Administrador). */
  registrarDevolucion: (id: number, datos: DatosDevolucion) =>
    request<DevolucionRegistrada>(`/pedidos/${id}/devoluciones`, { method: 'POST', body: datos }),

  estados: () => request<EstadosPedido>('/pedidos/estados'),
};
