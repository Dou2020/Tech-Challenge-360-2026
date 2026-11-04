import type { ReactNode } from 'react';

/** Error de un formulario al enviarlo (el mensaje de la API), dentro del propio formulario. */
export function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-peligro-borde bg-peligro-suave px-3 py-2 text-sm text-peligro-texto"
    >
      {children}
    </p>
  );
}
