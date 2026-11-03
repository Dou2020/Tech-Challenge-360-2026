/** Etiqueta y color de cada estado de pedido (tabla EstadoPedido). */
export type EstadoPedido =
  | 'PAGADO'
  | 'EN_PREPARACION'
  | 'DESPACHADO'
  | 'ENTREGADO'
  | 'DEVUELTO_PARCIAL'
  | 'DEVUELTO'
  | 'CANCELADO';

export type TonoBadge = 'gris' | 'verde' | 'azul' | 'ambar' | 'rojo' | 'marca';

export const estadosPedido: Record<EstadoPedido, { etiqueta: string; tono: TonoBadge }> = {
  PAGADO: { etiqueta: 'Pagado', tono: 'azul' },
  EN_PREPARACION: { etiqueta: 'En preparación', tono: 'ambar' },
  DESPACHADO: { etiqueta: 'Despachado', tono: 'marca' },
  ENTREGADO: { etiqueta: 'Entregado', tono: 'verde' },
  DEVUELTO_PARCIAL: { etiqueta: 'Devuelto parcialmente', tono: 'ambar' },
  DEVUELTO: { etiqueta: 'Devuelto', tono: 'rojo' },
  CANCELADO: { etiqueta: 'Cancelado', tono: 'gris' },
};

/** Estado desconocido: se muestra el código tal cual en gris. */
export function infoEstadoPedido(codigo: string): { etiqueta: string; tono: TonoBadge } {
  return estadosPedido[codigo as EstadoPedido] ?? { etiqueta: codigo, tono: 'gris' };
}
