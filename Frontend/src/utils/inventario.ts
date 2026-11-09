import type { TonoBadge } from '../config/orderStatus';
import type { Existencia } from '../types/inventario';

export type ClaseMovimiento = 'ENTRADA_COMPRA' | 'AJUSTE_ENTRADA' | 'AJUSTE_SALIDA';

/** Badge de la existencia disponible: agotado gana sobre bajo stock; sin problema, null. */
export function estadoExistencia(
  e: Pick<Existencia, 'existenciaDisponible' | 'bajoStock'>,
): { etiqueta: string; tono: TonoBadge } | null {
  if (e.existenciaDisponible <= 0) return { etiqueta: 'Agotado', tono: 'rojo' };
  if (e.bajoStock) return { etiqueta: 'Bajo stock', tono: 'ambar' };
  return null;
}

/**
 * Existencia que quedaría tras el movimiento, solo como vista previa: la reservada no cambia,
 * y la cifra real es la que devuelve el backend (que además rechaza una salida imposible).
 */
export function proyectarExistencia(
  variante: Pick<Existencia, 'existenciaFisica' | 'existenciaDisponible'>,
  clase: ClaseMovimiento,
  cantidad: number,
): { fisica: number; disponible: number } {
  const delta = clase === 'AJUSTE_SALIDA' ? -cantidad : cantidad;
  return {
    fisica: variante.existenciaFisica + delta,
    disponible: variante.existenciaDisponible + delta,
  };
}
