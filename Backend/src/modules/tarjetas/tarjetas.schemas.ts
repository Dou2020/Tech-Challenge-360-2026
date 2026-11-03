import { z } from 'zod';
import {
  marcaTarjeta,
  tipoTarjeta,
  titularTarjeta,
  ultimos4Tarjeta,
} from '../../shared/utils/esquemas.js';

/** POST /api/tarjetas. Sin vencimiento ni CVV: no se piden ni se guardan. */
export const tarjetaBody = z.object({
  titular: titularTarjeta,
  ultimos4: ultimos4Tarjeta,
  tipo: tipoTarjeta,
  marca: marcaTarjeta,
  predeterminada: z.boolean({ error: 'Debe ser true o false.' }).default(false),
});

export type TarjetaBody = z.infer<typeof tarjetaBody>;
