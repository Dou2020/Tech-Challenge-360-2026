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

/**
 * Cola de trabajo del personal: los estados que esperan una acción, en el orden en que se atienden.
 * La usan el panel de operación y los accesos rápidos de la lista de pedidos.
 */
export const colaOperacion: { estado: EstadoPedido; etiqueta: string }[] = [
  { estado: 'PAGADO', etiqueta: 'Por preparar' },
  { estado: 'EN_PREPARACION', etiqueta: 'Por despachar' },
  { estado: 'DESPACHADO', etiqueta: 'Por entregar' },
];

/**
 * Columnas del tablero de pedidos de la consola, en el orden del flujo. Las de trabajo muestran
 * primero lo más antiguo (la cola); Entregado y Cancelado, lo más reciente.
 */
export const columnasTablero: { estado: EstadoPedido; sort: string }[] = [
  { estado: 'PAGADO', sort: 'fechaCreacion:asc' },
  { estado: 'EN_PREPARACION', sort: 'fechaCreacion:asc' },
  { estado: 'DESPACHADO', sort: 'fechaCreacion:asc' },
  { estado: 'ENTREGADO', sort: 'fechaCreacion:desc' },
  { estado: 'CANCELADO', sort: 'fechaCreacion:desc' },
];
