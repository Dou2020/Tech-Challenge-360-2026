import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Input, Skeleton } from '../../components/atoms';
import {
  ConfirmationDialog,
  ErrorState,
  Notice,
  OrderStatusBadge,
  PageHeading,
} from '../../components/molecules';
import {
  OrderLinesTable,
  OrderStatusTimeline,
  OrderSummaryPanels,
  ReturnsList,
} from '../../components/organisms';
import {
  useCancelarPedido,
  useDevolucionesPedido,
  useHistorialPedido,
  usePedido,
} from '../../hooks/queries';
import { ApiError } from '../../services/http';
import { formatearFecha } from '../../utils/format';
import { avisoExito, errorNotice, type Aviso } from '../../utils/notice';
import NoEncontradoPage from '../errores/NoEncontradoPage';

const MAX_MOTIVO = 300;

export default function PedidoDetallePage() {
  const { id } = useParams();
  const idPedido = Number(id);
  const pedido = usePedido(idPedido);
  const historial = useHistorialPedido(idPedido);
  const devoluciones = useDevolucionesPedido(idPedido);
  const cancelar = useCancelarPedido(idPedido);
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);

  if (!Number.isInteger(idPedido) || idPedido < 1) return <NoEncontradoPage />;
  if (pedido.isPending) {
    return (
      <div role="status" aria-label="Cargando pedido" className="space-y-3">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (pedido.isError) {
    // Un pedido ajeno responde 404, igual que uno inexistente.
    if (pedido.error instanceof ApiError && pedido.error.status === 404)
      return <NoEncontradoPage />;
    return <ErrorState error={pedido.error} onReintentar={() => void pedido.refetch()} />;
  }

  const p = pedido.data;
  // Solo se ofrece cancelar si el backend lo permite ahora (transición con via CANCELAR).
  const puedeCancelar = p.transiciones.some((t) => t.via === 'CANCELAR');

  function confirmarCancelacion() {
    cancelar.mutate(motivo.trim() || undefined, {
      onSuccess: () => {
        setAviso(avisoExito('Pedido cancelado. La existencia y el cupón se reintegraron.'));
        setMotivo('');
      },
      onError: (error) => setAviso(errorNotice(error, 'No se pudo cancelar el pedido.')),
      onSettled: () => setConfirmando(false),
    });
  }

  return (
    <>
      <PageHeading
        titulo={`Pedido ${p.numeroPedido}`}
        descripcion={`Realizado el ${formatearFecha(p.fechaCreacion)}`}
        accion={
          <div className="flex items-center gap-3">
            <OrderStatusBadge estado={p.estado} />
            {puedeCancelar && (
              <Button variante="secondary" onClick={() => setConfirmando(true)}>
                Cancelar pedido
              </Button>
            )}
          </div>
        }
      />
      <Link
        to="/cuenta/pedidos"
        className="-mt-4 mb-4 inline-block text-sm text-acento hover:underline"
      >
        ← Volver a mis pedidos
      </Link>

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* `min-w-0`: sin él, el ancho mínimo de la tabla ensancha la columna y la página en móvil. */}
        <div className="min-w-0 space-y-6">
          <OrderLinesTable lineas={p.lineas} />

          <section aria-labelledby="titulo-historial" className="tarjeta p-5">
            <h2 id="titulo-historial" className="mb-4 font-semibold tracking-tight text-texto">
              Seguimiento
            </h2>
            {historial.isPending && <Skeleton className="h-20 w-full" />}
            {historial.isError && (
              <ErrorState error={historial.error} onReintentar={() => void historial.refetch()} />
            )}
            {historial.data && <OrderStatusTimeline historial={historial.data} />}
          </section>

          {devoluciones.isPending && <Skeleton className="h-16 w-full" />}
          {devoluciones.isError && (
            <ErrorState
              error={devoluciones.error}
              onReintentar={() => void devoluciones.refetch()}
            />
          )}
          {devoluciones.data && <ReturnsList devoluciones={devoluciones.data} />}
        </div>

        <OrderSummaryPanels pedido={p} />
      </div>

      <ConfirmationDialog
        abierto={confirmando}
        titulo="¿Cancelar este pedido?"
        descripcion="Se devolverá la existencia y, si usaste un cupón, podrás volver a usarlo. No se puede deshacer."
        textoConfirmar="Cancelar pedido"
        textoCancelar="Mantener pedido"
        cargando={cancelar.isPending}
        onConfirmar={confirmarCancelacion}
        onCancelar={() => setConfirmando(false)}
      >
        <Input
          label="Motivo (opcional)"
          value={motivo}
          maxLength={MAX_MOTIVO}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </ConfirmationDialog>
    </>
  );
}
