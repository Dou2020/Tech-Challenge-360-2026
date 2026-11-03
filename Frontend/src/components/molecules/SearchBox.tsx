import { Search } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';

interface Props {
  /** Valor inicial; el cuadro lo reinicia cuando cambia (p. ej. al navegar con ?q=). */
  valor?: string;
  placeholder?: string;
  etiqueta?: string;
  onBuscar: (texto: string) => void;
  className?: string;
}

/** Cuadro de búsqueda: emite el texto al enviar (Enter o botón). */
export function SearchBox({
  valor = '',
  placeholder = 'Buscar…',
  etiqueta = 'Buscar',
  onBuscar,
  className = '',
}: Props) {
  const [texto, setTexto] = useState(valor);
  const [anterior, setAnterior] = useState(valor);
  if (valor !== anterior) {
    setAnterior(valor);
    setTexto(valor);
  }

  function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    onBuscar(texto.trim());
  }

  return (
    <form role="search" onSubmit={enviar} className={`relative ${className}`}>
      <input
        type="search"
        aria-label={etiqueta}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        maxLength={150}
        className="block w-full rounded-lg border border-borde-fuerte bg-superficie py-2 pr-3 pl-9 text-sm text-texto shadow-xs outline-none transition-shadow placeholder:text-texto-tenue focus:border-primario focus:ring-3 focus:ring-primario/20"
      />
      <button
        type="submit"
        aria-label={etiqueta}
        className="absolute inset-y-0 left-0 flex items-center pr-2 pl-3 text-texto-tenue transition-colors hover:text-acento"
      >
        <Search className="size-4" aria-hidden />
      </button>
    </form>
  );
}
