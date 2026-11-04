import { z } from 'zod';

/** Política de contraseña del backend: 8 a 128 caracteres, con al menos una letra y un número. */
export const esquemaContrasenaNueva = z
  .string()
  .min(8, 'Debe tener al menos 8 caracteres.')
  .max(128, 'Máximo 128 caracteres.')
  .regex(/\p{L}/u, 'Debe incluir al menos una letra.')
  .regex(/\d/, 'Debe incluir al menos un número.');
