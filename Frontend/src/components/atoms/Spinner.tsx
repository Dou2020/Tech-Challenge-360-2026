import { LoaderCircle } from 'lucide-react';

const tamanos = { sm: 'size-4', md: 'size-6', lg: 'size-10' } as const;

interface Props {
  tamano?: keyof typeof tamanos;
  /** Dentro de un botón en carga: no se anuncia ni cambia el nombre accesible del botón. */
  decorativo?: boolean;
}

export function Spinner({ tamano = 'md', decorativo = false }: Props) {
  const clases = `${tamanos[tamano]} animate-spin text-current`;
  if (decorativo) return <LoaderCircle aria-hidden className={clases} />;
  return <LoaderCircle role="status" aria-label="Cargando" className={clases} />;
}
