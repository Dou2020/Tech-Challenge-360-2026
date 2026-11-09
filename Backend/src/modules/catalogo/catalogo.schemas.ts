import { z } from 'zod';
import {
  booleanoQuery,
  esquemaId,
  filtroTexto,
  textoObligatorio,
  textoOpcional,
} from '../../shared/utils/esquemas.js';
import { esquemaMonto } from '../../shared/utils/montos.js';
import { camposPaginacion } from '../../shared/utils/paginacion.js';

/** Las longitudes coinciden con los parámetros de los SPs: un texto más largo se truncaría. */
const MAX_NOMBRE_CATEGORIA = 100;
const MAX_DESCRIPCION_CATEGORIA = 500;
const MAX_NOMBRE_PRODUCTO = 150;
/** Producto.Descripcion es NVARCHAR(MAX); se limita para no aceptar cuerpos absurdos. */
const MAX_DESCRIPCION_PRODUCTO = 4000;
const MAX_SKU = 50;
const MAX_URL = 500;
const MAX_ATRIBUTO = 50;
/** Variantes por producto en un solo POST. */
const MAX_VARIANTES = 50;
/** Valores de atributo por variante (como máximo uno por atributo). */
const MAX_VALORES = 20;

/** Precio de venta: monto con hasta 2 decimales y mayor que 0. */
const precio = esquemaMonto.refine((valor) => valor > 0, 'Debe ser mayor que 0.');

const filtroPrecio = esquemaMonto.optional();

/** Un SKU repetido lo detecta el UNIQUE de Variante.SKU → 409 DUPLICADO. */
const sku = textoObligatorio(MAX_SKU);

/** IDValorAtributo de una variante, sin repetidos (el SP rechaza dos del mismo atributo). */
const valores = z
  .array(esquemaId, { error: 'Debe ser un arreglo de idValorAtributo.' })
  .max(MAX_VALORES, `Máximo ${MAX_VALORES} valores.`)
  .refine((ids) => new Set(ids).size === ids.length, 'Un valor de atributo está repetido.');

const existenciaInicial = z
  .number({ error: 'Debe ser un entero mayor o igual a 0.' })
  .int('Debe ser un entero mayor o igual a 0.')
  .min(0, 'Debe ser un entero mayor o igual a 0.')
  .max(1_000_000, 'Máximo 1000000 unidades.')
  .default(0);

const varianteNueva = z.object({
  sku,
  precio,
  existenciaInicial,
  valores: valores.default([]),
});

// --- Catálogo público ---------------------------------------------------------

export const buscarProductosQuery = z
  .object({
    q: filtroTexto(MAX_NOMBRE_PRODUCTO),
    idCategoria: esquemaId.optional(),
    precioMin: filtroPrecio,
    precioMax: filtroPrecio,
    disponible: booleanoQuery,
    ...camposPaginacion(['precio', 'nombre', 'fechaCreacion'], 'fechaCreacion:desc'),
  })
  .refine(
    ({ precioMin, precioMax }) =>
      precioMin === undefined || precioMax === undefined || precioMin <= precioMax,
    { path: ['precioMax'], message: 'Debe ser mayor o igual que precioMin.' },
  );

// --- Categorías -----------------------------------------------------------------

export const listarCategoriasQuery = z.object({
  q: filtroTexto(MAX_NOMBRE_CATEGORIA),
  activo: booleanoQuery,
  ...camposPaginacion(['nombre', 'activo', 'cantidadProductos'], 'nombre:asc'),
});

/** POST y PUT: en el PUT, omitir `descripcion` la borra. */
export const categoriaBody = z.object({
  nombre: textoObligatorio(MAX_NOMBRE_CATEGORIA),
  descripcion: textoOpcional(MAX_DESCRIPCION_CATEGORIA),
});

/** PATCH …/estado de categorías, productos y variantes. */
export const estadoBody = z.object({
  activo: z.boolean({ error: 'Debe ser true o false.' }),
});

// --- Productos ------------------------------------------------------------------

export const listarProductosQuery = z.object({
  q: filtroTexto(MAX_NOMBRE_PRODUCTO),
  idCategoria: esquemaId.optional(),
  activo: booleanoQuery,
  ...camposPaginacion(
    ['nombre', 'categoria', 'precio', 'existencia', 'fechaCreacion'],
    'fechaCreacion:desc',
  ),
});

const camposProducto = {
  idCategoria: esquemaId,
  nombre: textoObligatorio(MAX_NOMBRE_PRODUCTO),
  descripcion: textoOpcional(MAX_DESCRIPCION_PRODUCTO),
};

/** PUT: nombre, descripción (omitirla la borra) y categoría. */
export const productoBody = z.object(camposProducto);

export const crearProductoBody = z.object({
  ...camposProducto,
  variantes: z
    .array(varianteNueva, { error: 'Debe ser un arreglo de variantes.' })
    .min(1, 'El producto necesita al menos una variante.')
    .max(MAX_VARIANTES, `Máximo ${MAX_VARIANTES} variantes.`),
});

export const imagenBody = z.object({
  url: z
    .string()
    .trim()
    .max(MAX_URL, `Máximo ${MAX_URL} caracteres.`)
    .pipe(z.url({ protocol: /^https?$/, error: 'Debe ser una URL http:// o https://.' })),
  orden: z
    .number({ error: 'Debe ser un entero entre 0 y 255.' })
    .int('Debe ser un entero entre 0 y 255.')
    .min(0, 'Debe ser un entero entre 0 y 255.')
    .max(255, 'Debe ser un entero entre 0 y 255.')
    .optional(),
  esPrincipal: z.boolean({ error: 'Debe ser true o false.' }).default(false),
});

/**
 * Campos de texto de la subida multipart (`orden`, `esPrincipal`): llegan como cadenas.
 * Vacío o ausente usa el valor por defecto.
 */
const vacioAUndefined = (valor: unknown) =>
  typeof valor === 'string' && valor.trim() === '' ? undefined : valor;

export const imagenArchivoBody = z.object({
  orden: z.preprocess(
    vacioAUndefined,
    z.coerce
      .number({ error: 'Debe ser un entero entre 0 y 255.' })
      .int('Debe ser un entero entre 0 y 255.')
      .min(0, 'Debe ser un entero entre 0 y 255.')
      .max(255, 'Debe ser un entero entre 0 y 255.')
      .optional(),
  ),
  esPrincipal: z.preprocess(
    vacioAUndefined,
    z
      .enum(['true', 'false'], { error: 'Debe ser true o false.' })
      .transform((valor) => valor === 'true')
      .default(false),
  ),
});

/** Orden nuevo de las imágenes: la primera queda como principal. */
export const ordenImagenesBody = z
  .object({
    imagenes: z
      .array(esquemaId, { error: 'Debe ser un arreglo de IDs de imagen.' })
      .min(1, 'Envía al menos una imagen.')
      .max(256, 'Máximo 256 imágenes.'),
  })
  .strict()
  .superRefine((valor, ctx) => {
    if (new Set(valor.imagenes).size !== valor.imagenes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['imagenes'],
        message: 'No se permiten IDs de imagen repetidos.',
      });
    }
  });

export const paramsImagen = z.object({ id: esquemaId, idImagen: esquemaId });

// --- Variantes ------------------------------------------------------------------

export const crearVarianteBody = varianteNueva;

/** PUT: `valores` ausente conserva los actuales; `[]` los quita todos. */
export const actualizarVarianteBody = z.object({
  sku,
  valores: valores.optional(),
});

export const precioBody = z.object({ precio });

// --- Atributos ------------------------------------------------------------------

export const atributoBody = z.object({ nombre: textoObligatorio(MAX_ATRIBUTO) });

export const valorAtributoBody = z.object({ valor: textoObligatorio(MAX_ATRIBUTO) });

export type BuscarProductosQuery = z.infer<typeof buscarProductosQuery>;
export type ListarCategoriasQuery = z.infer<typeof listarCategoriasQuery>;
export type ListarProductosQuery = z.infer<typeof listarProductosQuery>;
export type CategoriaBody = z.infer<typeof categoriaBody>;
export type EstadoBody = z.infer<typeof estadoBody>;
export type ProductoBody = z.infer<typeof productoBody>;
export type CrearProductoBody = z.infer<typeof crearProductoBody>;
export type ImagenBody = z.infer<typeof imagenBody>;
export type ImagenArchivoBody = z.infer<typeof imagenArchivoBody>;
export type OrdenImagenesBody = z.infer<typeof ordenImagenesBody>;
export type ParamsImagen = z.infer<typeof paramsImagen>;
export type CrearVarianteBody = z.infer<typeof crearVarianteBody>;
export type ActualizarVarianteBody = z.infer<typeof actualizarVarianteBody>;
export type PrecioBody = z.infer<typeof precioBody>;
export type AtributoBody = z.infer<typeof atributoBody>;
export type ValorAtributoBody = z.infer<typeof valorAtributoBody>;
