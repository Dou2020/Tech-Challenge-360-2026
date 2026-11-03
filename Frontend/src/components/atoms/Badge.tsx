import type { ReactNode } from 'react';
import type { TonoBadge } from '../../config/orderStatus';

const tonos: Record<TonoBadge, string> = {
  gris: 'bg-superficie-suave text-texto-suave ring-borde',
  verde: 'bg-exito-suave text-exito-texto ring-exito-borde',
  azul: 'bg-info-suave text-info-texto ring-info-borde',
  ambar: 'bg-aviso-suave text-aviso-texto ring-aviso-borde',
  rojo: 'bg-peligro-suave text-peligro-texto ring-peligro-borde',
  marca: 'bg-acento-suave text-acento ring-acento/25',
};

export function Badge({ tono = 'gris', children }: { tono?: TonoBadge; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tonos[tono]}`}
    >
      {children}
    </span>
  );
}
