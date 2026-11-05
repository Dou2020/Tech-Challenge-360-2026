import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';

interface Props {
  desde: string;
  hasta: string;
  /** Muestra el error cuando `desde` es posterior a `hasta`. */
  valido: boolean;
  /** Si el rango ya es el de los últimos 30 días, no se ofrece restablecer. */
  esPorDefecto: boolean;
  onCambiar: (cambios: { desde?: string; hasta?: string }) => void;
  onRestablecer: () => void;
}

/** Rango de días de Guatemala para los reportes; el estado vive en la URL (useRangoFechas). */
export function DateRangeFilter({
  desde,
  hasta,
  valido,
  esPorDefecto,
  onCambiar,
  onRestablecer,
}: Props) {
  return (
    <div className="tarjeta mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
      <Input
        label="Desde"
        type="date"
        value={desde}
        onChange={(e) => onCambiar({ desde: e.target.value })}
      />
      <Input
        label="Hasta"
        type="date"
        value={hasta}
        error={valido ? undefined : 'Debe ser igual o posterior a la fecha inicial.'}
        onChange={(e) => onCambiar({ hasta: e.target.value })}
      />
      <div className="flex items-end">
        {!esPorDefecto && (
          <Button variante="ghost" onClick={onRestablecer}>
            Últimos 30 días
          </Button>
        )}
      </div>
    </div>
  );
}
