import { useMemo, useState } from 'react';
import type { Variante } from '../types/catalogo';
import {
  agruparAtributos,
  elegirValor,
  encontrarVariante,
  seleccionDeVariante,
  varianteInicial,
  type Seleccion,
} from '../utils/variantes';

/** Máximo por línea que acepta POST /carrito/items. */
export const MAXIMO_POR_LINEA = 1000;

/** Estado de la variante elegida y de la cantidad, con el tope de existencia disponible. */
export function useSeleccionVariante(variantes: Variante[]) {
  const grupos = useMemo(() => agruparAtributos(variantes), [variantes]);
  const [seleccion, setSeleccion] = useState<Seleccion>(() => {
    const inicial = varianteInicial(variantes);
    return inicial ? seleccionDeVariante(inicial) : {};
  });
  const [cantidadPedida, setCantidadPedida] = useState(1);

  const variante = useMemo(() => encontrarVariante(variantes, seleccion), [variantes, seleccion]);
  const maximo = Math.min(variante?.existenciaDisponible ?? 0, MAXIMO_POR_LINEA);
  // Si la existencia baja (p. ej. tras recargar), la cantidad se recorta al tope.
  const cantidad = maximo > 0 ? Math.min(Math.max(cantidadPedida, 1), maximo) : 0;

  return {
    grupos,
    seleccion,
    variante,
    maximo,
    cantidad,
    elegir: (idAtributo: number, idValorAtributo: number) => {
      setSeleccion((actual) => elegirValor(variantes, actual, idAtributo, idValorAtributo));
      setCantidadPedida(1);
    },
    setCantidad: setCantidadPedida,
  };
}
