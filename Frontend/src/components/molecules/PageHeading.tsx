import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}

export function PageHeading({ titulo, descripcion, accion }: Props) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-texto sm:text-3xl">{titulo}</h1>
        {descripcion && <p className="mt-1.5 text-sm text-texto-suave">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}
