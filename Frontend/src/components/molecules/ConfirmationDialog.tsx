import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '../atoms/Button';

interface Props {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  /** Contenido extra (p. ej. un campo de motivo). */
  children?: ReactNode;
  textoConfirmar?: string;
  textoCancelar?: string;
  cargando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

const ENFOCABLES =
  'button:not([disabled]), input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

/** Diálogo modal: Escape lo cierra y el foco queda atrapado dentro hasta cerrarlo. */
export function ConfirmationDialog({
  abierto,
  titulo,
  descripcion,
  children,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  cargando = false,
  onConfirmar,
  onCancelar,
}: Props) {
  const idTitulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  const alCancelar = useRef(onCancelar);
  useEffect(() => {
    alCancelar.current = onCancelar;
  });

  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const nodo = caja.current;
    nodo?.querySelector<HTMLElement>(ENFOCABLES)?.focus();

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        alCancelar.current();
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
        onClick={onCancelar}
      />
      <div
        ref={caja}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="relative w-full max-w-md rounded-2xl bg-superficie p-6 shadow-2xl ring-1 ring-borde"
      >
        <h2 id={idTitulo} className="text-lg font-semibold tracking-tight text-texto">
          {titulo}
        </h2>
        {descripcion && <p className="mt-2 text-sm text-texto-suave">{descripcion}</p>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variante="secondary" onClick={onCancelar} disabled={cargando}>
            {textoCancelar}
          </Button>
          <Button onClick={onConfirmar} cargando={cargando}>
            {textoConfirmar}
          </Button>
        </div>
      </div>
    </div>
  );
}
