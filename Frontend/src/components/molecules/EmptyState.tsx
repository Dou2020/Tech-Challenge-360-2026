import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}

export function EmptyState({ titulo, descripcion, accion }: Props) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-borde-fuerte bg-superficie px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-superficie-suave">
        <Inbox className="size-6 text-texto-tenue" aria-hidden />
      </div>
      <p className="mt-4 font-medium text-texto">{titulo}</p>
      {descripcion && <p className="mt-1 max-w-md text-sm text-texto-suave">{descripcion}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}
