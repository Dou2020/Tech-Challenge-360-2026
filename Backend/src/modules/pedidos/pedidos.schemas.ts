import { z } from 'zod';
import {
  esquemaId,
  filtroTexto,
  textoObligatorio,
  textoOpcional,
} from '../../shared/utils/esquemas.js';
import { filtroFecha, rangoValido } from '../../shared/utils/fechas.js';
import { camposPaginacion } from '../../shared/utils/paginacion.js';

/** Las longitudes coinciden con los parámetros de los SPs. */
const MAX_MOTIVO = 300;
const MAX_COMENTARIO = 300;
const MAX_CODIGO_ESTADO = 30;
const MAX_NUMERO = 50;
/** Tope por línea de una devolución; el SP además la limita a vendido − devuelto. */
const MAX_CANTIDAD = 1_000_000;

export const paramsPedido = z.object({ id: esquemaId });

export const listarPedidosQuery = z
  .object({
    estado: z.preprocess(
      (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
      z
        .string()
        .trim()
        .toUpperCase()
        .max(MAX_CODIGO_ESTADO, `Máximo ${MAX_CODIGO_ESTADO} caracteres.`)
        .regex(/^[A-Z_]+$/, 'Usa el código del estado, por ejemplo EN_PREPARACION.')
        .optional(),
    ),
    idCliente: esquemaId.optional(),
    desde: filtroFecha,
    hasta: filtroFecha,
    q: filtroTexto(MAX_NUMERO),
    ...camposPaginacion(['fechaCreacion', 'total'], 'fechaCreacion:desc'),
  })
  .refine(({ desde, hasta }) => rangoValido(desde, hasta), {
    path: ['hasta'],
    message: 'Debe ser igual o posterior a desde.',
  });

/** Sin body se acepta como {}: el motivo es opcional. */
export const cancelarBody = z
  .object({ motivo: textoOpcional(MAX_MOTIVO) })
  .default({ motivo: null });

export const cambiarEstadoBody = z.object({
  estado: z
    .string({ error: 'Es obligatorio.' })
    .trim()
    .toUpperCase()
    .min(1, 'Es obligatorio.')
    .max(MAX_CODIGO_ESTADO, `Máximo ${MAX_CODIGO_ESTADO} caracteres.`),
  comentario: textoOpcional(MAX_COMENTARIO),
});

export const devolucionBody = z.object({
  motivo: textoObligatorio(MAX_MOTIVO),
  lineas: z
    .array(
      z.object({
        idPedidoDetalle: esquemaId,
        cantidad: z
          .number({ error: 'Debe ser un entero mayor que 0.' })
          .int('Debe ser un entero mayor que 0.')
          .positive('Debe ser un entero mayor que 0.')
          .max(MAX_CANTIDAD, `Máximo ${MAX_CANTIDAD} unidades.`),
      }),
      { error: 'Debe ser una lista de líneas.' },
    )
    .min(1, 'Indica al menos una línea.'),
});

export type ParamsPedido = z.infer<typeof paramsPedido>;
export type ListarPedidosQuery = z.infer<typeof listarPedidosQuery>;
export type CancelarBody = z.infer<typeof cancelarBody>;
export type CambiarEstadoBody = z.infer<typeof cambiarEstadoBody>;
export type DevolucionBody = z.infer<typeof devolucionBody>;
