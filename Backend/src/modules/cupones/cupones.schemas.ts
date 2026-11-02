import { z } from 'zod';
import {
  booleanoQuery,
  esquemaId,
  filtroTexto,
  textoObligatorio,
  textoOpcional,
} from '../../shared/utils/esquemas.js';
import { camposPaginacion } from '../../shared/utils/paginacion.js';
import { esquemaMonto } from '../../shared/utils/montos.js';

/** Las longitudes coinciden con los parámetros de SP_Cupones_Crear y _Actualizar. */
const MAX_CODIGO = 30;
const MAX_DESCRIPCION = 300;
const MAX_LIMITE = 1_000_000;

/** Instante ISO 8601 con zona; sin zona sería ambiguo. */
const instante = z.iso
  .datetime({ offset: true, error: 'Usa un instante ISO 8601 con zona (2026-11-01T00:00:00Z).' })
  .transform((valor) => new Date(valor));

const entero = (minimo: number) =>
  z
    .number({ error: `Debe ser un entero mayor o igual que ${minimo}.` })
    .int(`Debe ser un entero mayor o igual que ${minimo}.`)
    .min(minimo, `Debe ser un entero mayor o igual que ${minimo}.`)
    .max(MAX_LIMITE, `Máximo ${MAX_LIMITE}.`);

/** POST y PUT (el PUT reemplaza todo: omitir descripción, categoría o mínimo los borra o reinicia). */
export const cuponBody = z
  .object({
    codigo: textoObligatorio(MAX_CODIGO).regex(
      /^[A-Za-z0-9_-]+$/,
      'Solo letras, números, guion y guion bajo.',
    ),
    descripcion: textoOpcional(MAX_DESCRIPCION),
    tipoDescuento: z.enum(['PORCENTAJE', 'MONTO_FIJO'], {
      error: 'Debe ser PORCENTAJE o MONTO_FIJO.',
    }),
    valor: esquemaMonto.refine((valor) => valor > 0, 'Debe ser mayor que 0.'),
    idCategoria: esquemaId.nullish().transform((valor) => valor ?? null),
    montoMinimo: esquemaMonto.default(0),
    fechaInicio: instante,
    fechaFin: instante,
    limiteUsosTotal: entero(1),
    limiteUsosPorCliente: entero(1).default(1),
  })
  .superRefine((cupon, ctx) => {
    if (cupon.tipoDescuento === 'PORCENTAJE' && cupon.valor > 100) {
      ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Un porcentaje no pasa de 100.' });
    }
    // Si una fecha ya falló su propio formato, no hay nada que comparar.
    const fechasValidas = cupon.fechaInicio instanceof Date && cupon.fechaFin instanceof Date;
    if (fechasValidas && cupon.fechaFin.getTime() <= cupon.fechaInicio.getTime()) {
      ctx.addIssue({
        code: 'custom',
        path: ['fechaFin'],
        message: 'Debe ser posterior a fechaInicio.',
      });
    }
    if (cupon.limiteUsosPorCliente > cupon.limiteUsosTotal) {
      ctx.addIssue({
        code: 'custom',
        path: ['limiteUsosPorCliente'],
        message: 'No puede superar limiteUsosTotal.',
      });
    }
  });

export const estadoBody = z.object({
  activo: z.boolean({ error: 'Debe ser true o false.' }),
});

export const listarCuponesQuery = z.object({
  q: filtroTexto(100),
  activo: booleanoQuery,
  vigente: booleanoQuery,
  ...camposPaginacion(['codigo', 'fechaInicio', 'fechaFin', 'usosActuales', 'valor'], 'codigo:asc'),
});

export const listarUsosQuery = z.object({
  ...camposPaginacion(['fecha', 'descuento'], 'fecha:desc'),
});

export type CuponBody = z.infer<typeof cuponBody>;
export type EstadoBody = z.infer<typeof estadoBody>;
export type ListarCuponesQuery = z.infer<typeof listarCuponesQuery>;
export type ListarUsosQuery = z.infer<typeof listarUsosQuery>;
