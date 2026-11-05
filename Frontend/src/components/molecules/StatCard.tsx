import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface Props {
  titulo: string;
  /** Valor ya formateado (por ejemplo con formatearMonto). */
  valor: ReactNode;
  ayuda?: string;
  /** Enlace opcional bajo el valor (por ejemplo, a la lista ya filtrada). */
  enlace?: { to: string; texto: string };
}

/** Indicador del dashboard y del panel de operación. */
export function StatCard({ titulo, valor, ayuda, enlace }: Props) {
  return (
    <div className="tarjeta p-5">
      <dt className="text-sm font-medium text-texto-suave">{titulo}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight text-texto tabular-nums">
        {valor}
      </dd>
      {ayuda && <p className="mt-1 text-xs text-texto-tenue">{ayuda}</p>}
      {enlace && (
        <Link
          to={enlace.to}
          className="mt-3 inline-block text-sm font-medium text-acento hover:underline"
        >
          {enlace.texto}
        </Link>
      )}
    </div>
  );
}
