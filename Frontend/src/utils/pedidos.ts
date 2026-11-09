import { infoEstadoPedido } from '../config/orderStatus';
import type { DestinoPedido, EstadosPedido } from '../types/pedidos';

/**
 * Estados a los que el rol de quien consulta puede mover un pedido que está en `origen`, según
 * `GET /api/pedidos/estados` (`permitida`). Sin repetir destinos y sin devoluciones, que son por
 * línea y se registran en el detalle.
 */
export function destinosPermitidos(
  catalogo: EstadosPedido | undefined,
  origen: string,
): DestinoPedido[] {
  const destinos: DestinoPedido[] = [];
  for (const t of catalogo?.transiciones ?? []) {
    if (!t.permitida || t.origen !== origen || t.via === 'DEVOLUCION') continue;
    if (destinos.some((d) => d.estado === t.destino)) continue;
    const nombre =
      catalogo?.estados.find((e) => e.codigo === t.destino)?.nombre ??
      infoEstadoPedido(t.destino).etiqueta;
    destinos.push({ estado: t.destino, nombre, via: t.via });
  }
  return destinos;
}
