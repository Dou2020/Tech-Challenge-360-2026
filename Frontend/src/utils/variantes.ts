import type { Variante } from '../types/catalogo';

export interface GrupoAtributo {
  idAtributo: number;
  atributo: string;
  valores: { idValorAtributo: number; valor: string }[];
}

/** Selección actual: idAtributo → idValorAtributo. */
export type Seleccion = Record<number, number>;

/** Agrupa los valores de las variantes por atributo, en orden de aparición y sin repetir. */
export function agruparAtributos(variantes: Variante[]): GrupoAtributo[] {
  const grupos = new Map<number, GrupoAtributo>();
  for (const variante of variantes) {
    for (const v of variante.valores) {
      const grupo = grupos.get(v.idAtributo) ?? {
        idAtributo: v.idAtributo,
        atributo: v.atributo,
        valores: [],
      };
      if (!grupo.valores.some((x) => x.idValorAtributo === v.idValorAtributo)) {
        grupo.valores.push({ idValorAtributo: v.idValorAtributo, valor: v.valor });
      }
      grupos.set(v.idAtributo, grupo);
    }
  }
  return [...grupos.values()];
}

export function seleccionDeVariante(variante: Variante): Seleccion {
  return Object.fromEntries(variante.valores.map((v) => [v.idAtributo, v.idValorAtributo]));
}

/** Variante que coincide exactamente con la selección, si existe. */
export function encontrarVariante(
  variantes: Variante[],
  seleccion: Seleccion,
): Variante | undefined {
  return variantes.find(
    (variante) =>
      variante.valores.length === Object.keys(seleccion).length &&
      variante.valores.every((v) => seleccion[v.idAtributo] === v.idValorAtributo),
  );
}

/** Variante inicial: la primera con existencia, o la primera de la lista. */
export function varianteInicial(variantes: Variante[]): Variante | undefined {
  return variantes.find((v) => v.existenciaDisponible > 0) ?? variantes[0];
}

/**
 * Cambia un atributo de la selección. Si la combinación resultante no existe, adopta la primera
 * variante (con existencia de preferencia) que tenga el valor elegido.
 */
export function elegirValor(
  variantes: Variante[],
  seleccion: Seleccion,
  idAtributo: number,
  idValorAtributo: number,
): Seleccion {
  const propuesta = { ...seleccion, [idAtributo]: idValorAtributo };
  if (encontrarVariante(variantes, propuesta)) return propuesta;
  const conValor = variantes.filter((v) =>
    v.valores.some((x) => x.idAtributo === idAtributo && x.idValorAtributo === idValorAtributo),
  );
  const alterna = conValor.find((v) => v.existenciaDisponible > 0) ?? conValor[0];
  return alterna ? seleccionDeVariante(alterna) : seleccion;
}
