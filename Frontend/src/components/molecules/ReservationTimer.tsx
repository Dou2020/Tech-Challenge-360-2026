import { Clock } from 'lucide-react';
import { useCuentaRegresiva } from '../../hooks/useCuentaRegresiva';

interface Props {
  /** reservaExpiraEn de la API (ISO 8601 UTC). */
  expiraEn: string;
  /** Se llama una sola vez cuando la cuenta llega a 0. */
  onVencida: () => void;
}

/** Cuenta regresiva de la reserva de existencia. */
export function ReservationTimer({ expiraEn, onVencida }: Props) {
  const segundos = useCuentaRegresiva(expiraEn, onVencida);
  const minutos = Math.floor(segundos / 60);
  const resto = String(segundos % 60).padStart(2, '0');
  const urgente = segundos <= 120;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 ring-inset ${
        urgente
          ? 'bg-aviso-suave text-aviso-texto ring-aviso-borde'
          : 'bg-acento-suave text-acento ring-acento/20'
      }`}
    >
      <Clock className="size-4" aria-hidden />
      <span>Tu existencia está reservada por</span>
      <span
        role="timer"
        aria-label="Tiempo restante de la reserva"
        className="font-semibold tabular-nums"
      >
        {minutos}:{resto}
      </span>
    </div>
  );
}
