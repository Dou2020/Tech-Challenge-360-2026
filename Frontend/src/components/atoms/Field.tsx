import type { ReactNode } from 'react';

interface Props {
  /** id del control; el error se publica como `${id}-error`. */
  id: string;
  label: string;
  error?: string | undefined;
  ayuda?: string | undefined;
  children: ReactNode;
}

/** Etiqueta + control + mensaje de error o ayuda de un campo de formulario. */
export function Field({ id, label, error, ayuda, children }: Props) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-peligro-texto">
          {error}
        </p>
      ) : (
        ayuda && (
          <p id={`${id}-ayuda`} className="mt-1.5 text-xs text-texto-tenue">
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}
