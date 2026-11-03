/** Atributos de accesibilidad del control según tenga error o ayuda. */
export function ariaCampo(id: string, error?: string, ayuda?: string) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined,
  } as const;
}

const estiloControl =
  'mt-1 block w-full rounded-lg border bg-superficie px-3 py-2 text-sm text-texto shadow-xs outline-none transition-shadow placeholder:text-texto-tenue focus:border-primario focus:ring-3 focus:ring-primario/20 disabled:bg-superficie-suave disabled:text-texto-tenue';

/** Clases de un input, select o textarea; con error el borde pasa a `peligro`. */
export function claseControl(conError: boolean): string {
  return `${estiloControl} ${conError ? 'border-peligro' : 'border-borde-fuerte'}`;
}
