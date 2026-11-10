import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Page } from '../../types/api';
import { Skeleton } from '../atoms/Skeleton';
import { EmptyState } from '../molecules/EmptyState';
import { ErrorState } from '../molecules/ErrorState';
import { Pagination } from '../molecules/Pagination';

export interface Columna<T> {
  /** Identifica la columna (key de React). */
  clave: string;
  titulo: string;
  /** Campo de `sort` que la ordena; sin él la columna no es ordenable. */
  orden?: string;
  alinear?: 'izquierda' | 'derecha';
  /** Oculta el título visualmente (columna de acciones). */
  tituloOculto?: boolean;
  celda: (fila: T) => ReactNode;
}

/** Lo que DataTable necesita de `useServerTable`. */
interface EstadoTabla {
  sort: string | undefined;
  setSort: (sort: string) => void;
  setPage: (pagina: number) => void;
  setPageSize: (tamano: number) => void;
}

/** Lo que DataTable necesita de una consulta de TanStack Query. */
interface Consulta<T> {
  data: Page<T> | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isPlaceholderData: boolean;
  refetch: () => unknown;
}

interface Props<T> {
  /** Descripción de la tabla para lectores de pantalla. */
  titulo: string;
  columnas: Columna<T>[];
  consulta: Consulta<T>;
  tabla: EstadoTabla;
  idFila: (fila: T) => string | number;
  /** Mensaje cuando no hay filas. */
  vacio: { titulo: string; descripcion?: string; accion?: ReactNode };
  opcionesTamano?: number[];
  /** Nombre accesible del indicador de carga; por defecto "Cargando <titulo>". */
  etiquetaCarga?: string;
}

/** "campo:asc" → { campo, direccion }. */
function parsearOrden(sort: string | undefined) {
  const [campo, direccion] = (sort ?? '').split(':');
  return { campo, direccion: direccion === 'desc' ? 'desc' : 'asc' } as const;
}

/**
 * Tabla genérica de la consola. La página, el tamaño y el orden viven en la URL (useServerTable)
 * y los resuelve el servidor; aquí solo se presentan los estados de carga, vacío y error.
 */
export function DataTable<T>({
  titulo,
  columnas,
  consulta,
  tabla,
  idFila,
  vacio,
  opcionesTamano = [10, 20, 50],
  etiquetaCarga,
}: Props<T>) {
  if (consulta.isPending) {
    return (
      <div
        role="status"
        aria-label={etiquetaCarga ?? `Cargando ${titulo.toLowerCase()}`}
        className="space-y-2"
      >
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (consulta.isError || !consulta.data) {
    return <ErrorState error={consulta.error} onReintentar={() => void consulta.refetch()} />;
  }
  const { items, page, pageSize, total } = consulta.data;
  if (items.length === 0) {
    return (
      <EmptyState titulo={vacio.titulo} descripcion={vacio.descripcion} accion={vacio.accion} />
    );
  }

  const actual = parsearOrden(tabla.sort);

  return (
    <div aria-busy={consulta.isPlaceholderData} className="transition-opacity aria-busy:opacity-60">
      {/* `relative`: contiene los `sr-only` (absolutos) de la tabla para que el scroll los recorte. */}
      <div className="tarjeta relative overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">{titulo}</caption>
          <thead className="border-b border-borde bg-superficie-suave/60 text-xs font-medium tracking-wide text-texto-tenue uppercase">
            <tr>
              {columnas.map((c) => {
                const ordenada = c.orden !== undefined && c.orden === actual.campo;
                const alinear = c.alinear === 'derecha' ? 'text-right' : '';
                return (
                  <th
                    key={c.clave}
                    scope="col"
                    className={`px-4 py-3 ${alinear}`}
                    aria-sort={
                      ordenada
                        ? actual.direccion === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {c.orden ? (
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 tracking-wide uppercase transition-colors hover:text-texto ${ordenada ? 'text-texto' : ''}`}
                        onClick={() => {
                          const direccion = ordenada && actual.direccion === 'asc' ? 'desc' : 'asc';
                          tabla.setSort(`${c.orden}:${direccion}`);
                        }}
                      >
                        {c.titulo}
                        {ordenada ? (
                          actual.direccion === 'asc' ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : c.tituloOculto ? (
                      <span className="sr-only">{c.titulo}</span>
                    ) : (
                      c.titulo
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {items.map((fila) => (
              <tr key={idFila(fila)} className="transition-colors hover:bg-superficie-suave/50">
                {columnas.map((c) => (
                  <td
                    key={c.clave}
                    className={`px-4 py-3 ${c.alinear === 'derecha' ? 'text-right' : ''}`}
                  >
                    {c.celda(fila)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        opcionesTamano={opcionesTamano}
        onPageChange={tabla.setPage}
        onPageSizeChange={tabla.setPageSize}
      />
    </div>
  );
}
