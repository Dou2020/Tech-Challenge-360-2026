import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '../services/http';

/**
 * Copia los `details` de un ApiError (field + message) a los campos del formulario.
 * Devuelve true si al menos un detalle correspondía a un campo conocido.
 */
export function aplicarErroresApi<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  campos: readonly Path<T>[],
): boolean {
  if (!(error instanceof ApiError)) return false;
  let aplicado = false;
  for (const { field, message } of error.details) {
    const campo = campos.find((c) => c === field);
    if (campo) {
      setError(campo, { type: 'server', message });
      aplicado = true;
    }
  }
  return aplicado;
}
