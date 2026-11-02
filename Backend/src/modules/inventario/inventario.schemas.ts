import { z } from 'zod';
import {
  booleanoQuery,
  esquemaId,
  filtroTexto,
  textoObligatorio,
  textoOpcional,
} from '../../shared/utils/esquemas.js';
import { filtroFecha, rangoValido } from '../../shared/utils/fechas.js';
import { camposPaginacion } from '../../shared/utils/paginacion.js';

/** Las longitudes coinciden con los parámetros de los SPs. */
const MAX_TEXTO = 150;
const MAX_MOTIVO = 300;
const MAX_CODIGO_TIPO = 30;
/** Límite por movimiento; el SP además rechaza un desborde del INT de la existencia. */
const MAX_CANTIDAD = 1_000_000;

const cantidad = z
  .number({ error: 'Debe ser un entero mayor que 0.' })
  .int('Debe ser un entero mayor que 0.')
  .positive('Debe ser un entero mayor que 0.')
  .max(MAX_CANTIDAD, `Máximo ${MAX_CANTIDAD} unidades por movimiento.`);

export const listarExistenciasQuery = z.object({
  q: filtroTexto(MAX_TEXTO),
  idCategoria: esquemaId.optional(),
  bajoStock: booleanoQuery,
  activo: booleanoQuery,
  ...camposPaginacion(
    [
      'sku',
      'producto',
      'categoria',
      'existenciaFisica',
      'existenciaReservada',
      'existenciaDisponible',
    ],
    'existenciaDisponible:asc',
  ),
});

export const paramsVariante = z.object({ idVariante: esquemaId });

export const kardexQuery = z
  .object({
    desde: filtroFecha,
    hasta: filtroFecha,
    /** Código del tipo (`AJUSTE_SALIDA`); uno inexistente → 400 desde el SP. */
    tipo: z.preprocess(
      (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
      z
        .string()
        .trim()
        .toUpperCase()
        .max(MAX_CODIGO_TIPO, `Máximo ${MAX_CODIGO_TIPO} caracteres.`)
        .regex(/^[A-Z_]+$/, 'Usa el código del tipo de movimiento, por ejemplo AJUSTE_SALIDA.')
        .optional(),
    ),
    ...camposPaginacion(['fecha'], 'fecha:desc'),
  })
  .refine(({ desde, hasta }) => rangoValido(desde, hasta), {
    path: ['hasta'],
    message: 'Debe ser igual o posterior a desde.',
  });

/** Entrada por compra; `motivo` ausente o vacío → 'Entrada por compra'. */
export const entradaBody = z.object({
  idVariante: esquemaId,
  cantidad,
  motivo: textoOpcional(MAX_MOTIVO),
});

export const ajusteBody = z.object({
  idVariante: esquemaId,
  tipo: z.enum(['ENTRADA', 'SALIDA'], { error: 'Debe ser ENTRADA o SALIDA.' }),
  cantidad,
  motivo: textoObligatorio(MAX_MOTIVO),
});

export type ListarExistenciasQuery = z.infer<typeof listarExistenciasQuery>;
export type ParamsVariante = z.infer<typeof paramsVariante>;
export type KardexQuery = z.infer<typeof kardexQuery>;
export type EntradaBody = z.infer<typeof entradaBody>;
export type AjusteBody = z.infer<typeof ajusteBody>;
