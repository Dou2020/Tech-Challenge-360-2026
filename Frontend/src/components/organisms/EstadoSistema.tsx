import { Database, Server } from 'lucide-react';
import { useEstadoSistema } from '../../hooks/queries/useEstadoSistema';
import { ApiError } from '../../services/http';
import type { EstadoDependencia } from '../../services/api/sistema';
import { formatearFecha } from '../../utils/format';
import { Spinner } from '../atoms/Spinner';
import { ErrorState } from '../molecules/ErrorState';

const etiquetaEstado = { ok: 'Operando', degradado: 'Degradado', caido: 'Sin servicio' } as const;

function Dependencia({
  nombre,
  estado,
  icono: Icono,
}: {
  nombre: string;
  estado: EstadoDependencia;
  icono: typeof Database;
}) {
  const arriba = estado === 'up';
  return (
    <li className="flex items-center justify-between rounded-lg border border-borde px-4 py-3">
      <span className="flex items-center gap-3 text-texto">
        <Icono className="size-5 text-texto-tenue" aria-hidden />
        {nombre}
      </span>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          arriba ? 'bg-exito-suave text-exito-texto' : 'bg-peligro-suave text-peligro-texto'
        }`}
      >
        {arriba ? 'Disponible' : 'Sin conexión'}
      </span>
    </li>
  );
}

/** Estado del backend y sus dependencias (GET /api/health). */
export function EstadoSistema() {
  const { data, isPending, isError, error, refetch } = useEstadoSistema();

  return (
    <section aria-labelledby="estado-sistema" className="tarjeta p-6">
      <h2 id="estado-sistema" className="font-semibold tracking-tight text-texto">
        Estado del sistema
      </h2>

      {isPending && (
        <div className="flex justify-center py-8 text-acento">
          <Spinner />
        </div>
      )}

      {isError && (
        <div className="mt-4">
          <ErrorState
            mensaje={error instanceof ApiError ? error.message : 'No se pudo consultar el estado.'}
            referencia={error instanceof ApiError ? error.requestId : undefined}
            onReintentar={() => void refetch()}
          />
        </div>
      )}

      {data && (
        <>
          <p className="mt-1 text-sm text-texto-suave">
            API: <strong>{etiquetaEstado[data.status]}</strong> · actualizado{' '}
            {formatearFecha(data.timestamp)}
          </p>
          <ul className="mt-4 space-y-2">
            <Dependencia nombre="SQL Server" estado={data.sqlServer} icono={Database} />
            <Dependencia nombre="Redis" estado={data.redis} icono={Server} />
          </ul>
        </>
      )}
    </section>
  );
}
