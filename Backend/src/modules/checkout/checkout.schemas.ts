import { z } from 'zod';
import {
  esquemaId,
  marcaTarjeta,
  tipoTarjeta,
  titularTarjeta,
  ultimos4Tarjeta,
} from '../../shared/utils/esquemas.js';

export const iniciarBody = z.object({
  idDireccion: esquemaId,
  idMetodoEnvio: esquemaId,
});

/** Opcional: sin método el costo de envío del resumen es 0. */
export const resumenQuery = z.object({ idMetodoEnvio: esquemaId.optional() });

/** Pago con una tarjeta guardada del cliente. Estricto: `guardar` o el titular junto al id es 400. */
const pagoConTarjetaGuardada = z.strictObject({ idTarjeta: esquemaId });

/**
 * Tarjeta nueva. `tipo` y `marca` solo son obligatorios si se pide guardarla. El número completo
 * y el CVV no existen en el contrato: nunca se reciben.
 */
const pagoConTarjetaNueva = z
  .object({
    titular: titularTarjeta,
    ultimos4: ultimos4Tarjeta,
    tipo: tipoTarjeta.optional(),
    marca: marcaTarjeta.optional(),
    guardar: z.boolean({ error: 'Debe ser true o false.' }).optional(),
  })
  .superRefine((datos, ctx) => {
    if (datos.guardar !== true) return;
    for (const campo of ['tipo', 'marca'] as const) {
      if (datos[campo] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [campo],
          message: 'Es obligatorio para guardar la tarjeta.',
        });
      }
    }
  });

export type DatosPagoBody =
  z.infer<typeof pagoConTarjetaGuardada> | z.infer<typeof pagoConTarjetaNueva>;

/**
 * Unión `{ idTarjeta }` | `{ titular, ultimos4, … }`. Se elige la rama por la presencia de
 * `idTarjeta` en vez de z.union para que los errores indiquen el campo real y no "Invalid input".
 */
const datosPago = z.unknown().transform((valor, ctx): DatosPagoBody => {
  const rama =
    typeof valor === 'object' && valor !== null && 'idTarjeta' in valor
      ? pagoConTarjetaGuardada
      : pagoConTarjetaNueva;
  const resultado = rama.safeParse(valor);
  if (resultado.success) return resultado.data;
  for (const issue of resultado.error.issues) {
    ctx.issues.push({
      code: 'custom',
      input: valor,
      path: issue.path,
      message:
        issue.code === 'unrecognized_keys'
          ? 'Con idTarjeta no se envían otros datos de la tarjeta (ni guardar).'
          : issue.message,
    });
  }
  return z.NEVER;
});

export const pagarBody = z.object({
  idDireccion: esquemaId,
  idMetodoEnvio: esquemaId,
  /** El pago es simulado: solo TARJETA (la tabla Pago lo restringe con un CHECK). */
  metodoPago: z.literal('TARJETA', { error: 'Solo se acepta TARJETA.' }),
  datosPago: datosPago,
});

export type IniciarBody = z.infer<typeof iniciarBody>;
export type ResumenQuery = z.infer<typeof resumenQuery>;
export type PagarBody = z.infer<typeof pagarBody>;
