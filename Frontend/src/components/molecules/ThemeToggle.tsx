import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTema } from '../../hooks/useTema';
import type { PreferenciaTema } from '../../utils/tema';

const OPCIONES: { valor: PreferenciaTema; etiqueta: string; icono: LucideIcon }[] = [
  { valor: 'claro', etiqueta: 'Tema claro', icono: Sun },
  { valor: 'oscuro', etiqueta: 'Tema oscuro', icono: Moon },
  { valor: 'sistema', etiqueta: 'Tema del sistema', icono: Monitor },
];

/** Selector de tema claro / oscuro / sistema: tres botones con `aria-pressed`. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { preferencia, cambiarPreferencia } = useTema();
  return (
    <div
      role="group"
      aria-label="Tema"
      className={`inline-flex items-center gap-0.5 rounded-full bg-superficie-suave p-0.5 ring-1 ring-borde ${className}`}
    >
      {OPCIONES.map(({ valor, etiqueta, icono: Icono }) => {
        const activo = preferencia === valor;
        return (
          <button
            key={valor}
            type="button"
            aria-label={etiqueta}
            aria-pressed={activo}
            title={etiqueta}
            onClick={() => cambiarPreferencia(valor)}
            className={`rounded-full p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-primario ${
              activo ? 'bg-superficie text-texto shadow-xs' : 'text-texto-tenue hover:text-texto'
            }`}
          >
            <Icono className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
