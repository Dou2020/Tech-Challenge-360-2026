import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

type Variante = 'primary' | 'secondary' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  cargando?: boolean;
}

const estilos: Record<Variante, string> = {
  primary: 'bg-primario text-sobre-primario shadow-xs hover:bg-primario-hover',
  secondary:
    'bg-superficie text-texto shadow-xs ring-1 ring-borde-fuerte ring-inset hover:bg-superficie-suave',
  ghost: 'text-texto-suave hover:bg-superficie-suave hover:text-texto',
};

export function Button({
  variante = 'primary',
  cargando = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...resto
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario disabled:cursor-not-allowed disabled:opacity-60 ${estilos[variante]} ${className}`}
      {...resto}
    >
      {cargando && <Spinner tamano="sm" decorativo />}
      {children}
    </button>
  );
}
