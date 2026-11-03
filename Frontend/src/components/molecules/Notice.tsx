import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect } from 'react';
import type { Aviso, TipoAviso } from '../../utils/notice';

const estilos: Record<TipoAviso, { caja: string; icono: typeof Info }> = {
  exito: { caja: 'border-exito-borde bg-exito-suave text-exito-texto', icono: CircleCheck },
  error: { caja: 'border-peligro-borde bg-peligro-suave text-peligro-texto', icono: CircleAlert },
  info: { caja: 'border-info-borde bg-info-suave text-info-texto', icono: Info },
};

interface Props {
  aviso: Aviso;
  onCerrar?: () => void;
  /** Cierre automático en ms (solo éxito e info; un error queda hasta que se cierre). */
  duracionMs?: number;
}

export function Notice({ aviso, onCerrar, duracionMs = 6000 }: Props) {
  const { caja, icono: Icono } = estilos[aviso.tipo];

  useEffect(() => {
    if (!onCerrar || aviso.tipo === 'error') return;
    const id = setTimeout(onCerrar, duracionMs);
    return () => clearTimeout(id);
  }, [aviso, onCerrar, duracionMs]);

  return (
    <div
      role={aviso.tipo === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${caja}`}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">
        <p>{aviso.mensaje}</p>
        {aviso.referencia && (
          <p className="mt-0.5 text-xs opacity-75">Referencia: {aviso.referencia}</p>
        )}
      </div>
      {onCerrar && (
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={onCerrar}
          className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
