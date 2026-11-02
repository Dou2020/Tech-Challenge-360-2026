import { z } from 'zod';

export const paramsClave = z.object({
  clave: z
    .string()
    .trim()
    .min(1)
    .max(50, 'Máximo 50 caracteres.')
    .regex(/^[A-Za-z]+$/, 'Clave inválida.'),
});

/** Acepta texto o número; el rango de cada clave lo valida el SP (400 VALIDACION). */
export const valorBody = z.object({
  valor: z
    .union([z.string(), z.number()], { error: 'Es obligatorio.' })
    .transform((valor) => String(valor).trim())
    .pipe(z.string().min(1, 'Es obligatorio.').max(200, 'Máximo 200 caracteres.')),
});

export type ParamsClave = z.infer<typeof paramsClave>;
export type ValorBody = z.infer<typeof valorBody>;
