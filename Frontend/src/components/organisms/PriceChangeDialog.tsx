import { useState } from 'react';
import { ApiError } from '../../services/http';
import type { VarianteGestion } from '../../types/gestion';
import { formatearMonto } from '../../utils/format';
import { esPrecioValido, MENSAJE_PRECIO } from '../../utils/productoForm';
import { Input } from '../atoms/Input';
import { ConfirmationDialog } from '../molecules/ConfirmationDialog';

interface Props {
  variante: VarianteGestion;
  /** Aplica el precio; debe rechazar con el ApiError si falla. */
  onConfirmar: (precio: string) => Promise<unknown>;
  onCancelar: () => void;
}

/**
 * Cambio de precio de una variante. Muestra "anterior → nuevo" y aclara que los pedidos ya hechos
 * conservan su precio. El cambio queda en la bitácora.
 */
export function PriceChangeDialog({ variante, onConfirmar, onCancelar }: Props) {
  const [precio, setPrecio] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const valido = esPrecioValido(precio.trim());

  async function confirmar() {
    const limpio = precio.trim();
    if (!esPrecioValido(limpio)) return setError(MENSAJE_PRECIO);
    setError(undefined);
    setEnviando(true);
    try {
      await onConfirmar(limpio);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cambiar el precio.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ConfirmationDialog
      abierto
      titulo={`Cambiar el precio de ${variante.sku}`}
      descripcion="El precio se guarda en la bitácora. Los pedidos ya realizados conservan el precio con el que se vendieron."
      textoConfirmar="Cambiar precio"
      cargando={enviando}
      onConfirmar={() => void confirmar()}
      onCancelar={onCancelar}
    >
      <Input
        label="Nuevo precio"
        inputMode="decimal"
        placeholder="149.00"
        value={precio}
        error={error}
        onChange={(e) => setPrecio(e.target.value)}
      />
      <p className="mt-3 text-sm text-texto-suave" aria-live="polite">
        {formatearMonto(variante.precio)} →{' '}
        <strong>{valido ? formatearMonto(precio.trim()) : '—'}</strong>
      </p>
    </ConfirmationDialog>
  );
}
