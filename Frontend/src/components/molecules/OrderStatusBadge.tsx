import { infoEstadoPedido } from '../../config/orderStatus';
import { Badge } from '../atoms/Badge';

/** Estado del pedido con su etiqueta y color (config/orderStatus.ts). */
export function OrderStatusBadge({ estado }: { estado: string }) {
  const { etiqueta, tono } = infoEstadoPedido(estado);
  return <Badge tono={tono}>{etiqueta}</Badge>;
}
