import { TriangleAlert } from 'lucide-react';
import { ApiError } from '../../services/http';
import { Button } from '../atoms/Button';

interface Props {
  /** Error capturado: si es un ApiError se usan su mensaje y su requestId. */
  error?: unknown;
  mensaje?: string;
  /** Identificador de la petición para soporte (requestId de la API). */
  referencia?: string | undefined;
  onReintentar?: () => void;
}

export function ErrorState({ error, mensaje, referencia, onReintentar }: Props) {
  const apiError = error instanceof ApiError ? error : undefined;
  const texto = mensaje ?? apiError?.message ?? 'No se pudo cargar la información.';
  const ref = referencia ?? apiError?.requestId;
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-2xl border border-peligro-borde bg-peligro-suave px-6 py-8 text-center"
    >
      <TriangleAlert className="size-8 text-peligro" aria-hidden />
      <p className="mt-3 font-medium text-peligro-texto">{texto}</p>
      {ref && <p className="mt-1 text-xs text-peligro-texto/80">Referencia: {ref}</p>}
      {onReintentar && (
        <Button variante="secondary" className="mt-4" onClick={onReintentar}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
