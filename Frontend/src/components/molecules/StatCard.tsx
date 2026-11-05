import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  /** Valor ya formateado (por ejemplo con formatearMonto). */
  valor: ReactNode;
  ayuda?: string;
}

/** Indicador del dashboard. */
export function StatCard({ titulo, valor, ayuda }: Props) {
  return (
    <div className="tarjeta p-5">
      <dt className="text-sm font-medium text-texto-suave">{titulo}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight text-texto tabular-nums">
        {valor}
      </dd>
      {ayuda && <p className="mt-1 text-xs text-texto-tenue">{ayuda}</p>}
    </div>
  );
}
