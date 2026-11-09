import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  abierto: boolean;
  titulo: string;
  descripcion?: ReactNode;
  children?: ReactNode;
  /** Escape, el clic fuera de la caja y los botones de cierre del contenido. */
  onCerrar: () => void;
  ancho?: 'md' | 'lg';
}

const ENFOCABLES =
  'button:not([disabled]), input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

const ANCHOS = { md: 'max-w-md', lg: 'max-w-2xl' } as const;

/** Diálogo modal: Escape lo cierra, el foco queda atrapado dentro y vuelve a su sitio al cerrar. */
export function Dialog({ abierto, titulo, descripcion, children, onCerrar, ancho = 'md' }: Props) {
  const idTitulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  const alCerrar = useRef(onCerrar);
  useEffect(() => {
    alCerrar.current = onCerrar;
  });

  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const nodo = caja.current;
    nodo?.querySelector<HTMLElement>(ENFOCABLES)?.focus();

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        alCerrar.current();
        return;
      }
      if (evento.key !== 'Tab' || !nodo) return;
      const lista = [...nodo.querySelectorAll<HTMLElement>(ENFOCABLES)];
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      if (!primero || !ultimo) return;
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      previo?.focus();
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden
        onClick={onCerrar}
      />
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className={`relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl bg-superficie p-6 shadow-2xl ring-1 ring-borde ${ANCHOS[ancho]}`}
      >
        <h2 id={idTitulo} className="text-lg font-semibold tracking-tight text-texto">
          {titulo}
        </h2>
        {descripcion && <div className="mt-2 text-sm text-texto-suave">{descripcion}</div>}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}
