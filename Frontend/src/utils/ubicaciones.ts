import datos from '../data/guatemala-locations.json';

interface Departamento {
  nombre: string;
  municipios: string[];
}

const departamentos: Departamento[] = datos.departamentos;

/** Nombres de los 22 departamentos, en orden alfabético. */
export const nombresDepartamentos: string[] = departamentos.map((d) => d.nombre);

/** Municipios de un departamento; vacío si no existe. */
export function municipiosDe(departamento: string): string[] {
  return departamentos.find((d) => d.nombre === departamento)?.municipios ?? [];
}
