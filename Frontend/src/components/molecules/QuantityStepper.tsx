import { Minus, Plus } from 'lucide-react';

interface Props {
  valor: number;
  onChange: (cantidad: number) => void;
  /** Tope: existencia disponible. Con 0 el control queda deshabilitado. */
  max: number;
  min?: number;
  etiqueta?: string;
  disabled?: boolean;
}

/** Selector de cantidad entre `min` y `max` (la existencia disponible). */
export function QuantityStepper({
  valor,
  onChange,
  max,
  min = 1,
  etiqueta = 'Cantidad',
  disabled = false,
}: Props) {
  const sinStock = max < min;
  const ajustar = (n: number) => onChange(Math.min(Math.max(Math.trunc(n) || min, min), max));
  const boton =
    'flex size-9 items-center justify-center text-texto-suave transition-colors hover:bg-superficie-suave hover:text-texto disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-borde-fuerte bg-superficie shadow-xs">
      <button
        type="button"
        aria-label="Disminuir cantidad"
        className={boton}
        disabled={disabled || sinStock || valor <= min}
        onClick={() => ajustar(valor - 1)}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        type="number"
        aria-label={etiqueta}
        inputMode="numeric"
        min={min}
        max={max}
        value={sinStock ? 0 : valor}
        disabled={disabled || sinStock}
        onChange={(e) => ajustar(Number(e.target.value))}
        className="h-9 w-12 [appearance:textfield] border-x border-borde-fuerte bg-transparent text-center text-sm text-texto tabular-nums outline-none disabled:bg-superficie-suave disabled:text-texto-tenue [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label="Aumentar cantidad"
        className={boton}
        disabled={disabled || sinStock || valor >= max}
        onClick={() => ajustar(valor + 1)}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
