import { z } from 'zod';

/** Máximo de un INT de SQL Server: un id mayor no existe y truncaría el parámetro. */
const INT_MAXIMO = 2_147_483_647;

/** Id de ruta o de query (`/productos/:id`, `?idCategoria=3`): entero positivo. */
export const esquemaId = z.coerce
  .number({ error: 'Debe ser un número entero positivo.' })
  .int('Debe ser un número entero positivo.')
  .positive('Debe ser un número entero positivo.')
  .max(INT_MAXIMO, 'Id fuera de rango.');

/** Params `{ id }` de las rutas `/:id`. */
export const paramsId = z.object({ id: esquemaId });

/** Texto obligatorio sin espacios sobrantes. */
export const textoObligatorio = (maximo: number) =>
  z.string().trim().min(1, 'Es obligatorio.').max(maximo, `Máximo ${maximo} caracteres.`);

/**
 * Texto opcional del body: ausente, null o vacío se guardan como NULL.
 * En un PUT, omitirlo borra el valor anterior.
 */
export const textoOpcional = (maximo: number) =>
  z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor),
    z
      .string()
      .trim()
      .max(maximo, `Máximo ${maximo} caracteres.`)
      .nullish()
      .transform((valor) => valor ?? null),
  );

/** Filtro de texto de un listado (`q`): vacío o ausente → sin filtro (undefined → NULL). */
export const filtroTexto = (maximo: number) =>
  z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
    z.string().trim().max(maximo, `Máximo ${maximo} caracteres.`).optional(),
  );

/**
 * Booleano de query string: solo "true" o "false". Ausente → undefined (el SP recibe NULL:
 * sin filtro). No usa z.coerce.boolean porque convertiría "false" en true.
 */
export const booleanoQuery = z
  .enum(['true', 'false'], { error: 'Debe ser true o false.' })
  .transform((valor) => valor === 'true')
  .optional();

/** Tipo, marca, titular y últimos 4 de una tarjeta (guardada o del pago); coinciden con los CHECK de TarjetaGuardada. */
export const TIPOS_TARJETA = ['CREDITO', 'DEBITO'] as const;
export const MARCAS_TARJETA = ['VISA', 'MASTERCARD', 'AMEX', 'OTRA'] as const;
const MAX_TITULAR_TARJETA = 150;

export const tipoTarjeta = z.enum(TIPOS_TARJETA, { error: 'Debe ser CREDITO o DEBITO.' });
export const marcaTarjeta = z.enum(MARCAS_TARJETA, {
  error: 'Debe ser VISA, MASTERCARD, AMEX u OTRA.',
});
export const titularTarjeta = textoObligatorio(MAX_TITULAR_TARJETA);
export const ultimos4Tarjeta = z
  .string({ error: 'Deben ser los 4 últimos dígitos de la tarjeta.' })
  .regex(/^\d{4}$/, 'Deben ser los 4 últimos dígitos de la tarjeta.');
