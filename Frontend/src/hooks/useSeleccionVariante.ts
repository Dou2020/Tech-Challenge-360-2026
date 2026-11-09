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

export interface OpcionesSeleccion {
  /** Variante con la que arranca (p. ej. la que ya está en el carrito); si no existe, se ignora. */
  idVarianteInicial?: number;
  /** Unidades de cada variante que ya están en el carrito: POST /carrito/items las suma. */
  enCarrito?: ReadonlyMap<number, number>;
}

const SIN_CARRITO: ReadonlyMap<number, number> = new Map();

/**
 * Estado de la variante elegida y de la cantidad a agregar, con el tope de existencia disponible
 * menos lo que ya está en el carrito.
 */
export function useSeleccionVariante(variantes: Variante[], opciones: OpcionesSeleccion = {}) {
  const { idVarianteInicial, enCarrito: mapaCarrito = SIN_CARRITO } = opciones;
  const grupos = useMemo(() => agruparAtributos(variantes), [variantes]);
  const [seleccion, setSeleccion] = useState<Seleccion>(() => {
    const inicial =
      variantes.find((v) => v.idVariante === idVarianteInicial) ?? varianteInicial(variantes);
    return inicial ? seleccionDeVariante(inicial) : {};
  });
  const [cantidadPedida, setCantidadPedida] = useState(1);

  const variante = useMemo(() => encontrarVariante(variantes, seleccion), [variantes, seleccion]);
  const enCarrito = variante ? (mapaCarrito.get(variante.idVariante) ?? 0) : 0;
  const maximo = Math.max(
    0,
    Math.min((variante?.existenciaDisponible ?? 0) - enCarrito, MAXIMO_POR_LINEA),
  );
  // Si la existencia baja (p. ej. tras recargar), la cantidad se recorta al tope.
  const cantidad = maximo > 0 ? Math.min(Math.max(cantidadPedida, 1), maximo) : 0;

  return {
    grupos,
    seleccion,
    variante,
    enCarrito,
    maximo,
    cantidad,
    elegir: (idAtributo: number, idValorAtributo: number) => {
      setSeleccion((actual) => elegirValor(variantes, actual, idAtributo, idValorAtributo));
      setCantidadPedida(1);
    },
    setCantidad: setCantidadPedida,
  };
}
