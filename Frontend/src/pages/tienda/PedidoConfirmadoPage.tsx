import { CircleCheck } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Skeleton } from '../../components/atoms';
import { ErrorState } from '../../components/molecules';
import { Money } from '../../components/atoms';
import { OrderStatusBadge } from '../../components/molecules';
import { usePedido } from '../../hooks/queries';
import { ApiError } from '../../services/http';
import { formatearFecha } from '../../utils/format';
import NoEncontradoPage from '../errores/NoEncontradoPage';

export default function PedidoConfirmadoPage() {
  const { id } = useParams();
  const idPedido = Number(id);
  const pedido = usePedido(idPedido);

  if (!Number.isInteger(idPedido) || idPedido < 1) return <NoEncontradoPage />;
  if (pedido.isPending) {
    return (
      <div role="status" aria-label="Cargando pedido" className="mx-auto max-w-lg space-y-3">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (pedido.isError) {
    if (pedido.error instanceof ApiError && pedido.error.status === 404)
      return <NoEncontradoPage />;
    return <ErrorState error={pedido.error} onReintentar={() => void pedido.refetch()} />;
  }

  const p = pedido.data;
  return (
    <div className="tarjeta mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-exito-suave ring-1 ring-exito-borde">
        <CircleCheck className="size-8 text-exito" aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-texto">
        ¡Gracias por tu compra!
      </h1>
      <p className="mt-1 text-sm text-texto-suave">Tu pago fue aprobado y registramos tu pedido.</p>
      <dl className="mt-6 space-y-2 text-left text-sm">
        <div className="flex justify-between">
          <dt className="text-texto-suave">Número de pedido</dt>
          <dd className="font-medium">{p.numeroPedido}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-texto-suave">Estado</dt>
          <dd>
            <OrderStatusBadge estado={p.estado} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-texto-suave">Fecha</dt>
          <dd>{formatearFecha(p.fechaCreacion)}</dd>
        </div>
        <div className="flex justify-between border-t border-borde pt-2 text-base font-semibold">
          <dt>Total pagado</dt>
          <dd>
            <Money valor={p.total} />
          </dd>
        </div>
      </dl>
      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm font-medium">
        <Link
          to={`/cuenta/pedidos/${p.idPedido}`}
          className="rounded-lg bg-primario px-4 py-2 text-sobre-primario shadow-xs transition-colors hover:bg-primario-hover"
        >
          Ver el pedido
        </Link>
        <Link
          to="/catalogo"
          className="rounded-lg px-4 py-2 text-acento transition-colors hover:bg-acento-suave"
        >
          Seguir comprando
        </Link>
      </div>
    </div>
  );
}
