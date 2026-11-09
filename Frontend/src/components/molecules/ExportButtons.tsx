import { FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import type { FormatoExportacion } from '../../types/exportacion';
import { Button } from '../atoms/Button';

interface Props {
  /** Nombre del reporte, para el nombre accesible de cada botón. */
  titulo: string;
  /** Genera el archivo. Debe manejar sus propios errores (la página los muestra con un aviso). */
  onExportar: (formato: FormatoExportacion) => Promise<void>;
  deshabilitado?: boolean;
}

const opciones: { formato: FormatoExportacion; etiqueta: string; icono: typeof FileText }[] = [
  { formato: 'excel', etiqueta: 'Excel', icono: FileSpreadsheet },
  { formato: 'pdf', etiqueta: 'PDF', icono: FileText },
];

/** Botones Excel y PDF de un reporte. Mientras se genera un archivo, ambos quedan deshabilitados. */
export function ExportButtons({ titulo, onExportar, deshabilitado = false }: Props) {
  const [generando, setGenerando] = useState<FormatoExportacion | null>(null);

  async function exportar(formato: FormatoExportacion) {
    setGenerando(formato);
    try {
      await onExportar(formato);
    } finally {
      setGenerando(null);
    }
  }

  return (
    <div className="flex gap-2" role="group" aria-label={`Exportar ${titulo.toLowerCase()}`}>
      {opciones.map(({ formato, etiqueta, icono: Icono }) => (
        <Button
          key={formato}
          variante="secondary"
          className="min-h-8 px-3 text-xs"
          aria-label={`Exportar ${titulo.toLowerCase()} a ${etiqueta}`}
          cargando={generando === formato}
          disabled={deshabilitado || generando !== null}
          onClick={() => void exportar(formato)}
        >
          {generando !== formato && <Icono className="size-4" aria-hidden />}
          {etiqueta}
        </Button>
      ))}
    </div>
  );
}
