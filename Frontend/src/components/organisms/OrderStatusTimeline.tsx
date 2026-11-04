import type { CambioEstadoPedido } from '../../types/pedidos';
import { formatearFecha } from '../../utils/format';
import { OrderStatusBadge } from '../molecules/OrderStatusBadge';

/** Historial de estados de un pedido, del más antiguo al más reciente. Reutilizable en la consola. */
export function OrderStatusTimeline({ historial }: { historial: CambioEstadoPedido[] }) {
  return (
    <ol className="space-y-4 border-l-2 border-borde pl-5" aria-label="Historial de estados">
      {historial.map((cambio) => (
        <li key={cambio.idHistorialEstadoPedido} className="relative">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[1.6rem] size-3 rounded-full bg-primario ring-4 ring-superficie"
          />
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge estado={cambio.estadoNuevo.codigo} />
            <time dateTime={cambio.fecha} className="text-xs text-texto-tenue">
              {formatearFecha(cambio.fecha)}
            </time>
          </div>
          <p className="mt-1 text-sm text-texto-suave">
            {cambio.estadoAnterior ? `Antes: ${cambio.estadoAnterior.nombre}` : 'Pedido creado'}
            {' · '}
            {cambio.usuario}
          </p>
          {cambio.comentario && <p className="text-sm text-texto-suave">“{cambio.comentario}”</p>}
        </li>
      ))}
    </ol>
  );
}
