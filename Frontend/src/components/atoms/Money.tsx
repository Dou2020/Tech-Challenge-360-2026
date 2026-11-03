import { formatearMonto } from '../../utils/format';

/** Muestra un monto de la API ("125.50") en quetzales. No hace cálculos. */
export function Money({ valor, className = '' }: { valor: string | number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatearMonto(valor)}</span>;
}
