import type { ReactNode } from 'react';
import type { EntradaBitacora } from '../../types/administracion';
import { formatearFecha } from '../../utils/format';
import { DataTable, type Columna } from './DataTable';

type Valores = Record<string, unknown> | null;

function texto(valor: unknown): string {
  if (valor === undefined) return '—';
  return typeof valor === 'string' ? valor : JSON.stringify(valor);
}

/** Campo por campo: valor anterior frente al nuevo; si solo hay uno de los dos, el otro queda en "—". */
function Cambios({ anterior, nuevo }: { anterior: Valores; nuevo: Valores }) {
  const campos = [...new Set([...Object.keys(anterior ?? {}), ...Object.keys(nuevo ?? {})])];
  if (campos.length === 0) return <span className="text-texto-tenue">Sin detalle</span>;
  return (
    <details>
      <summary className="cursor-pointer text-acento hover:underline">Ver cambios</summary>
      <table className="mt-2 w-full text-xs">
        <thead className="text-left text-texto-tenue">
          <tr>
            <th scope="col" className="pr-3 font-medium">
              Campo
            </th>
            <th scope="col" className="pr-3 font-medium">
              Anterior
            </th>
            <th scope="col" className="font-medium">
              Nuevo
            </th>
          </tr>
        </thead>
        <tbody>
          {campos.map((c) => (
            <tr key={c} className="align-top">
              <td className="pr-3 font-mono">{c}</td>
              <td className="pr-3 font-mono break-all text-peligro-texto">
                {texto(anterior?.[c])}
              </td>
              <td className="font-mono break-all text-exito-texto">{texto(nuevo?.[c])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-texto-tenue">JSON completo</summary>
        <pre className="mt-1 overflow-x-auto rounded bg-superficie-suave p-2 text-xs">
          {JSON.stringify({ valorAnterior: anterior, valorNuevo: nuevo }, null, 2)}
        </pre>
      </details>
    </details>
  );
}

const columnas: Columna<EntradaBitacora>[] = [
  {
    clave: 'fecha',
    titulo: 'Fecha',
    orden: 'fecha',
    celda: (e) => <span className="text-texto-suave">{formatearFecha(e.fecha)}</span>,
  },
  {
    clave: 'usuario',
    titulo: 'Usuario',
    celda: (e) => (
      <>
        {e.usuario}
        <span className="block text-xs text-texto-tenue">{e.correoUsuario}</span>
      </>
    ),
  },
  { clave: 'modulo', titulo: 'Módulo', orden: 'modulo', celda: (e) => e.modulo },
  {
    clave: 'entidad',
    titulo: 'Entidad',
    orden: 'entidad',
    celda: (e) => `${e.entidad} #${e.idRegistro}`,
  },
  { clave: 'accion', titulo: 'Acción', orden: 'accion', celda: (e) => e.accion },
  {
    clave: 'cambios',
    titulo: 'Cambios',
    celda: (e) => <Cambios anterior={e.valorAnterior} nuevo={e.valorNuevo} />,
  },
];

type TablaProps = Omit<
  Parameters<typeof DataTable<EntradaBitacora>>[0],
  'columnas' | 'idFila' | 'titulo' | 'vacio'
> & {
  vacio: { titulo: string; descripcion?: string; accion?: ReactNode };
};

/** Bitácora de auditoría (solo lectura): cada fila despliega los valores anterior y nuevo. */
export function AuditLogTable({ consulta, tabla, vacio, ...resto }: TablaProps) {
  return (
    <DataTable
      titulo="Registros de la bitácora"
      columnas={columnas}
      consulta={consulta}
      tabla={tabla}
      idFila={(e) => e.idBitacora}
      vacio={vacio}
      {...resto}
    />
  );
}
