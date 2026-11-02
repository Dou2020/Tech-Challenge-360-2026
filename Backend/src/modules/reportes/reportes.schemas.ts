import { z } from 'zod';
import { camposPaginacion } from '../../shared/utils/paginacion.js';

/** Los reportes agrupan por día local: solo aceptan `YYYY-MM-DD` (sin hora ni zona). */
const diaReporte = z.preprocess(
  (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
  z.iso.date({ error: 'Usa una fecha YYYY-MM-DD (día de Guatemala).' }).optional(),
);

const rangoCampos = { desde: diaReporte, hasta: diaReporte };

const rangoOrdenado = ({
  desde,
  hasta,
}: {
  desde?: string | undefined;
  hasta?: string | undefined;
}) => desde === undefined || hasta === undefined || desde <= hasta;

const mensajeRango = { path: ['hasta'], message: 'Debe ser igual o posterior a desde.' };

export const rangoQuery = z.object(rangoCampos).refine(rangoOrdenado, mensajeRango);

export const ventasQuery = z
  .object({
    ...rangoCampos,
    agrupacion: z
      .enum(['dia', 'semana', 'mes'], { error: 'Usa dia, semana o mes.' })
      .default('dia'),
  })
  .refine(rangoOrdenado, mensajeRango);

export const topProductosQuery = z
  .object({
    ...rangoCampos,
    limite: z.coerce.number().int().min(1).max(100).default(10),
  })
  .refine(rangoOrdenado, mensajeRango);

export const carritosQuery = z
  .object({
    ...rangoCampos,
    ...camposPaginacion(['fecha', 'valor', 'unidades', 'cliente'], 'fecha:asc'),
  })
  .refine(rangoOrdenado, mensajeRango);

export type RangoQuery = z.infer<typeof rangoQuery>;
export type VentasQuery = z.infer<typeof ventasQuery>;
export type TopProductosQuery = z.infer<typeof topProductosQuery>;
export type CarritosQuery = z.infer<typeof carritosQuery>;
