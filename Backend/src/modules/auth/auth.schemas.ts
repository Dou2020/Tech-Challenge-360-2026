import { z } from 'zod';

/** Correo sin espacios y en minúsculas: así coincide con la clave del bloqueo por intentos. */
const correo = z
  .string()
  .trim()
  .toLowerCase()
  .max(150, 'Máximo 150 caracteres.')
  .pipe(z.email('Correo inválido.'));

const texto = (maximo: number) =>
  z.string().trim().min(1, 'Es obligatorio.').max(maximo, `Máximo ${maximo} caracteres.`);

export const registroSchema = z.object({
  correo,
  contrasena: z
    .string()
    .min(8, 'Debe tener al menos 8 caracteres.')
    .max(128, 'Máximo 128 caracteres.')
    .regex(/\p{L}/u, 'Debe incluir al menos una letra.')
    .regex(/\d/, 'Debe incluir al menos un número.'),
  nombre: texto(100),
  apellido: texto(100),
  // Opcional: ausente, null o vacío se guardan como NULL.
  telefono: z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor),
    z
      .string()
      .trim()
      .max(20, 'Máximo 20 caracteres.')
      .regex(/^\+?[\d\s-]{8,20}$/, 'Teléfono inválido.')
      .nullish()
      .transform((valor) => valor ?? null),
  ),
});

export const loginSchema = z.object({
  correo,
  // Sin reglas de formato: no se revela la política de contraseñas al que intenta adivinar.
  contrasena: z.string().min(1, 'Es obligatoria.').max(128, 'Máximo 128 caracteres.'),
});

export type RegistroBody = z.infer<typeof registroSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
