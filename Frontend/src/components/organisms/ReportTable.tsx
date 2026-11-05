import type { Columna } from './DataTable';

interface Props<T> {
  titulo: string;
  columnas: Columna<T>[];
  filas: T[];
  idFila: (fila: T) => string | number;
}

/** Tabla simple de un reporte que llega completo (sin paginación). Para listados paginados, DataTable. */
export function ReportTable<T>({ titulo, columnas, filas, idFila }: Props<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">{titulo}</caption>
        <thead className="border-b border-borde text-xs tracking-wide text-texto-tenue uppercase">
          <tr>
            {columnas.map((c) => (
              <th
                key={c.clave}
                scope="col"
                className={`px-3 py-2 ${c.alinear === 'derecha' ? 'text-right' : ''}`}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {filas.map((fila) => (
            <tr key={idFila(fila)}>
              {columnas.map((c) => (
                <td
                  key={c.clave}
                  className={`px-3 py-2 ${c.alinear === 'derecha' ? 'text-right' : ''}`}
                >
                  {c.celda(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
