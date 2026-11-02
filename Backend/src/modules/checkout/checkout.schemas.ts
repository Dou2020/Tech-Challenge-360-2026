import { z } from 'zod';
import { esquemaId, textoObligatorio } from '../../shared/utils/esquemas.js';

/** Longitud de Pago.Titular / @TitularTarjeta. */
const MAX_TITULAR = 150;

export const iniciarBody = z.object({
  idDireccion: esquemaId,
  idMetodoEnvio: esquemaId,
});

/** Opcional: sin método el costo de envío del resumen es 0. */
export const resumenQuery = z.object({ idMetodoEnvio: esquemaId.optional() });

export const pagarBody = z.object({
  idDireccion: esquemaId,
  idMetodoEnvio: esquemaId,
  /** El pago es simulado: solo TARJETA (la tabla Pago lo restringe con un CHECK). */
  metodoPago: z.literal('TARJETA', { error: 'Solo se acepta TARJETA.' }),
  datosPago: z.object({
    titular: textoObligatorio(MAX_TITULAR),
    ultimos4: z
      .string({ error: 'Deben ser los 4 últimos dígitos de la tarjeta.' })
      .regex(/^\d{4}$/, 'Deben ser los 4 últimos dígitos de la tarjeta.'),
  }),
});

export type IniciarBody = z.infer<typeof iniciarBody>;
export type ResumenQuery = z.infer<typeof resumenQuery>;
export type PagarBody = z.infer<typeof pagarBody>;
