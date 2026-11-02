import { z } from 'zod';
import { esquemaId } from '../../shared/utils/esquemas.js';

/** Máximo por línea: el SP además la limita a la existencia disponible. */
const MAX_CANTIDAD = 1000;
/** Longitud de la columna Cupon.Codigo. */
const MAX_CODIGO = 30;

const cantidad = z
  .number({ error: 'Debe ser un entero mayor que 0.' })
  .int('Debe ser un entero mayor que 0.')
  .positive('Debe ser un entero mayor que 0.')
  .max(MAX_CANTIDAD, `Máximo ${MAX_CANTIDAD} unidades por línea.`);

export const agregarItemBody = z.object({ idVariante: esquemaId, cantidad });

export const actualizarItemBody = z.object({ cantidad });

export const paramsItem = z.object({ idVariante: esquemaId });

export const aplicarCuponBody = z.object({
  codigo: z
    .string({ error: 'Es obligatorio.' })
    .trim()
    .min(1, 'Es obligatorio.')
    .max(MAX_CODIGO, `Máximo ${MAX_CODIGO} caracteres.`),
});

/** Opcional: si no viene se usa el header X-Cart-Token. Sin body se acepta como {}. */
export const fusionarBody = z
  .object({ tokenInvitado: z.uuid({ error: 'Debe ser un UUID.' }).optional() })
  .default({});

export type AgregarItemBody = z.infer<typeof agregarItemBody>;
export type ActualizarItemBody = z.infer<typeof actualizarItemBody>;
export type ParamsItem = z.infer<typeof paramsItem>;
export type AplicarCuponBody = z.infer<typeof aplicarCuponBody>;
export type FusionarBody = z.infer<typeof fusionarBody>;
