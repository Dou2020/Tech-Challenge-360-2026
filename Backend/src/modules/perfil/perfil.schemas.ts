import { z } from 'zod';
import { contrasenaNueva, telefono, texto } from '../auth/auth.schemas.js';

/** PUT reemplaza los tres campos: omitir `telefono` lo borra. */
export const perfilBody = z.object({
  nombre: texto(100),
  apellido: texto(100),
  telefono,
});

export const cambioContrasenaBody = z.object({
  // Sin reglas de formato: solo se compara con la guardada.
  contrasenaActual: z.string().min(1, 'Es obligatoria.').max(128, 'Máximo 128 caracteres.'),
  contrasenaNueva,
});

export type PerfilBody = z.infer<typeof perfilBody>;
export type CambioContrasenaBody = z.infer<typeof cambioContrasenaBody>;
