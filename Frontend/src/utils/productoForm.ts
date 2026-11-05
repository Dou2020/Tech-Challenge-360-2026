import { z } from 'zod';
import type { VarianteGestion } from '../types/gestion';

/** Mismas reglas que Backend/API.md, "Productos" y "Variantes". */
export const MAX_NOMBRE_PRODUCTO = 150;
export const MAX_DESCRIPCION_PRODUCTO = 4000;
export const MAX_SKU = 50;
export const MAX_VARIANTES = 50;
export const MAX_EXISTENCIA = 1_000_000;

/** Precio: hasta 10 enteros y 2 decimales, mayor que 0. */
export function esPrecioValido(texto: string): boolean {
  return /^\d{1,10}(\.\d{1,2})?$/.test(texto) && Number(texto) > 0;
}

export const MENSAJE_PRECIO = 'Ingresa un precio mayor que 0 con hasta 2 decimales.';

/** Clave del valor de un atributo dentro de `valores` (los números como clave se leerían como arreglo). */
export const claveAtributo = (idAtributo: number) => `a${idAtributo}`;

/** `valores` del formulario ({ a1: "5", a2: "" }) → IDs de valor para la API. */
export function idsDeValores(valores: Record<string, string> | undefined): number[] {
  return Object.values(valores ?? {})
    .filter((v) => v !== '')
    .map(Number);
}

/** Valores actuales de una variante como los espera el formulario. */
export function valoresDeVariante(variante: VarianteGestion): Record<string, string> {
  return Object.fromEntries(
    variante.valores.map((v) => [claveAtributo(v.idAtributo), String(v.idValorAtributo)]),
  );
}

export const esquemaVariante = z.object({
  sku: z.string().trim().min(1, 'Ingresa el SKU.').max(MAX_SKU, `Máximo ${MAX_SKU} caracteres.`),
  precio: z.string().trim().refine(esPrecioValido, MENSAJE_PRECIO),
  existenciaInicial: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) <= MAX_EXISTENCIA),
      `Debe ser un entero entre 0 y ${MAX_EXISTENCIA}.`,
    ),
  valores: z.record(z.string(), z.string()),
});

/** Reglas entre variantes del mismo formulario: SKU y combinación de valores no se repiten. */
export function validarVariantes(
  variantes: { sku: string; valores: Record<string, string> }[],
  agregar: (indice: number, campo: 'sku' | 'valores', mensaje: string) => void,
) {
  const skus = new Map<string, number>();
  const combinaciones = new Map<string, number>();
  variantes.forEach((v, i) => {
    const sku = v.sku.trim().toLowerCase();
    if (sku) {
      if (skus.has(sku)) agregar(i, 'sku', 'Este SKU está repetido en el formulario.');
      else skus.set(sku, i);
    }
    const combinacion = idsDeValores(v.valores)
      .sort((a, b) => a - b)
      .join(',');
    if (combinacion) {
      if (combinaciones.has(combinacion))
        agregar(i, 'valores', 'Otra variante tiene la misma combinación de valores.');
      else combinaciones.set(combinacion, i);
    }
  });
}

export const esquemaProducto = z.object({
  idCategoria: z.string().min(1, 'Elige una categoría.'),
  nombre: z
    .string()
    .trim()
    .min(1, 'Ingresa el nombre.')
    .max(MAX_NOMBRE_PRODUCTO, `Máximo ${MAX_NOMBRE_PRODUCTO} caracteres.`),
  descripcion: z
    .string()
    .trim()
    .max(MAX_DESCRIPCION_PRODUCTO, `Máximo ${MAX_DESCRIPCION_PRODUCTO} caracteres.`),
  variantes: z.array(esquemaVariante),
});

export type FormularioProducto = z.infer<typeof esquemaProducto>;

/** Esquema para crear: 1 a 50 variantes sin SKU ni combinaciones repetidos. */
export const esquemaProductoNuevo = esquemaProducto
  .extend({
    variantes: z
      .array(esquemaVariante)
      .min(1, 'El producto necesita al menos una variante.')
      .max(MAX_VARIANTES, `Máximo ${MAX_VARIANTES} variantes.`),
  })
  .superRefine((valor, contexto) =>
    validarVariantes(valor.variantes, (indice, campo, message) =>
      contexto.addIssue({ code: 'custom', path: ['variantes', indice, campo], message }),
    ),
  );

export const varianteVacia = (): FormularioProducto['variantes'][number] => ({
  sku: '',
  precio: '',
  existenciaInicial: '',
  valores: {},
});
