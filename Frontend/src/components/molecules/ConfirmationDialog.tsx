import type { ReactNode } from 'react';
import { Button } from '../atoms/Button';
import { Dialog } from './Dialog';

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

/** Diálogo modal de confirmación: un `Dialog` con Cancelar y Confirmar. */
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
  return (
    <Dialog abierto={abierto} titulo={titulo} descripcion={descripcion} onCerrar={onCancelar}>
      {children}
      <div className={`${children ? 'mt-6' : 'mt-2'} flex justify-end gap-2`}>
        <Button variante="secondary" onClick={onCancelar} disabled={cargando}>
          {textoCancelar}
        </Button>
        <Button onClick={onConfirmar} cargando={cargando}>
          {textoConfirmar}
        </Button>
      </div>
    </Dialog>
  );
}
