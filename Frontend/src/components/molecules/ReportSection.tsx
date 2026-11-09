import type { ReactNode } from 'react';
import { Skeleton } from '../atoms/Skeleton';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

interface Consulta<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  fetchStatus?: string;
}

interface Props<T> {
  titulo: string;
  consulta: Consulta<T>;
  /** Cuándo la respuesta cuenta como vacía; por defecto, un arreglo sin elementos. */
  estaVacio?: (datos: T) => boolean;
  textoVacio?: string;
  /** Acciones junto al título (p. ej. exportar); solo se muestran cuando hay datos. */
  acciones?: (datos: T) => ReactNode;
  children: (datos: T) => ReactNode;
}

/** Bloque de un reporte con sus tres estados: carga, vacío y error (con reintentar y referencia). */
export function ReportSection<T>({
  titulo,
  consulta,
  estaVacio = (d) => Array.isArray(d) && d.length === 0,
  textoVacio = 'No hay datos en el periodo elegido.',
  acciones,
  children,
}: Props<T>) {
  // Sin rango válido la consulta está deshabilitada: no hay nada que mostrar.
  const inactiva = consulta.isPending && consulta.fetchStatus === 'idle';
  const datos = consulta.isPending || consulta.isError ? undefined : consulta.data;
  return (
    <section aria-label={titulo} className="tarjeta p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold tracking-tight text-texto">{titulo}</h2>
        {acciones && datos !== undefined && !estaVacio(datos) && acciones(datos)}
      </div>
      {inactiva ? (
        <p className="text-sm text-texto-suave">
          Corrige el rango de fechas para ver este reporte.
        </p>
      ) : consulta.isPending ? (
        <div role="status" aria-label={`Cargando ${titulo.toLowerCase()}`}>
          <Skeleton className="h-48 w-full" />
        </div>
      ) : consulta.isError || consulta.data === undefined ? (
        <ErrorState error={consulta.error} onReintentar={() => void consulta.refetch()} />
      ) : estaVacio(consulta.data) ? (
        <EmptyState titulo="Sin resultados" descripcion={textoVacio} />
      ) : (
        children(consulta.data)
      )}
    </section>
  );
}
