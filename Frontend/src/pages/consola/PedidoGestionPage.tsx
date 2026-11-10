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
  ReturnForm,
  ReturnsList,
} from '../../components/organisms';
import {
  useCambiarEstadoPedido,
  useCancelarPedido,
  useDevolucionesPedido,
  useHistorialPedido,
  usePedido,
  useRegistrarDevolucion,
} from '../../hooks/queries';
import { ApiError } from '../../services/http';
import type { DatosDevolucion } from '../../types/pedidos';
import { formatearFecha, formatearMonto } from '../../utils/format';
import { avisoErrorTransicion, avisoExito, type Aviso } from '../../utils/notice';
import NoEncontradoPage from '../errores/NoEncontradoPage';

const MAX_TEXTO = 300;

type Accion = { tipo: 'ESTADO'; estado: string; nombre: string } | { tipo: 'CANCELAR' };

/** Detalle de un pedido para el personal: acciones según `transiciones[].via`. */
export default function PedidoGestionPage() {
  const { id } = useParams();
  const idPedido = Number(id);
  const pedido = usePedido(idPedido);
  const historial = useHistorialPedido(idPedido);
  const devoluciones = useDevolucionesPedido(idPedido);
  const cambiarEstado = useCambiarEstadoPedido(idPedido);
  const cancelar = useCancelarPedido(idPedido);
  const devolver = useRegistrarDevolucion(idPedido);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [texto, setTexto] = useState('');
  const [devolviendo, setDevolviendo] = useState(false);
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
    if (pedido.error instanceof ApiError && pedido.error.status === 404)
      return <NoEncontradoPage />;
    return <ErrorState error={pedido.error} onReintentar={() => void pedido.refetch()} />;
  }

  const p = pedido.data;
  const transicionesEstado = p.transiciones.filter((t) => t.via === 'ESTADO');
  const puedeCancelar = p.transiciones.some((t) => t.via === 'CANCELAR');
  const puedeDevolver = p.transiciones.some((t) => t.via === 'DEVOLUCION');

  function cerrarDialogo() {
    setAccion(null);
    setTexto('');
  }

  function confirmar() {
    if (!accion) return;
    const opcional = texto.trim() || undefined;
    const alFallar = (error: unknown) => {
      setAviso(avisoErrorTransicion(error));
      if (error instanceof ApiError && error.code === 'TRANSICION_NO_PERMITIDA')
        void pedido.refetch();
    };
    if (accion.tipo === 'ESTADO') {
      const { estado, nombre } = accion;
      cambiarEstado.mutate(
        { estado, ...(opcional ? { comentario: opcional } : {}) },
        {
          onSuccess: () => setAviso(avisoExito(`El pedido pasó a "${nombre}".`)),
          onError: alFallar,
          onSettled: cerrarDialogo,
        },
      );
    } else {
      cancelar.mutate(opcional, {
        onSuccess: () =>
          setAviso(avisoExito('Pedido cancelado. La existencia y el cupón se reintegraron.')),
        onError: alFallar,
        onSettled: cerrarDialogo,
      });
    }
  }

  async function registrarDevolucion(datos: DatosDevolucion) {
    try {
      const resultado = await devolver.mutateAsync(datos);
      setAviso(
        avisoExito(
          `Devolución registrada: reembolso de ${formatearMonto(resultado.montoReembolso)}. El pedido quedó en "${resultado.estadoPedido}".`,
        ),
      );
      setDevolviendo(false);
    } catch (error) {
      // El formulario muestra el detalle; si el estado cambió, se refresca para ocultar la acción.
      if (error instanceof ApiError && error.code === 'TRANSICION_NO_PERMITIDA')
        void pedido.refetch();
      throw error;
    }
  }

  const enCurso = cambiarEstado.isPending || cancelar.isPending;
  const esCancelar = accion?.tipo === 'CANCELAR';

  return (
    <>
      <PageHeading
        titulo={`Pedido ${p.numeroPedido}`}
        descripcion={`${p.cliente} (${p.correoCliente}) · ${formatearFecha(p.fechaCreacion)}`}
        accion={<OrderStatusBadge estado={p.estado} />}
      />
      <Link
        to="/consola/pedidos"
        className="-mt-4 mb-4 inline-block text-sm text-acento hover:underline"
      >
        ← Volver a pedidos
      </Link>

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      {(transicionesEstado.length > 0 || puedeCancelar || puedeDevolver) && (
        <section aria-labelledby="titulo-acciones" className="tarjeta mb-6 p-5">
          <h2 id="titulo-acciones" className="font-semibold tracking-tight text-texto">
            Acciones
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {transicionesEstado.map((t) => (
              <Button
                key={t.estado}
                onClick={() => setAccion({ tipo: 'ESTADO', estado: t.estado, nombre: t.nombre })}
              >
                Pasar a {t.nombre}
              </Button>
            ))}
            {puedeDevolver && !devolviendo && (
              <Button variante="secondary" onClick={() => setDevolviendo(true)}>
                Registrar devolución
              </Button>
            )}
            {puedeCancelar && (
              <Button variante="secondary" onClick={() => setAccion({ tipo: 'CANCELAR' })}>
                Cancelar pedido
              </Button>
            )}
          </div>
          {puedeDevolver && devolviendo && (
            <div className="mt-5 border-t border-borde pt-4">
              <h3 className="mb-3 text-sm font-semibold text-texto">Registrar devolución</h3>
              <ReturnForm
                lineas={p.lineas}
                onEnviar={registrarDevolucion}
                onCancelar={() => setDevolviendo(false)}
              />
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* `min-w-0`: sin él, el ancho mínimo de la tabla ensancha la columna y la página en móvil. */}
        <div className="min-w-0 space-y-6">
          <OrderLinesTable lineas={p.lineas} />

          <section aria-labelledby="titulo-historial" className="tarjeta p-5">
            <h2 id="titulo-historial" className="mb-4 font-semibold tracking-tight text-texto">
              Historial de estados
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
        abierto={accion !== null}
        titulo={
          accion?.tipo === 'ESTADO'
            ? `¿Pasar el pedido a "${accion.nombre}"?`
            : '¿Cancelar este pedido?'
        }
        descripcion={
          esCancelar
            ? 'Se devolverá la existencia y se liberará el cupón. No se puede deshacer.'
            : 'El cambio queda en el historial del pedido.'
        }
        textoConfirmar={esCancelar ? 'Cancelar pedido' : 'Confirmar cambio'}
        textoCancelar={esCancelar ? 'Mantener pedido' : 'Cancelar'}
        cargando={enCurso}
        onConfirmar={confirmar}
        onCancelar={cerrarDialogo}
      >
        <Input
          label={esCancelar ? 'Motivo (opcional)' : 'Comentario (opcional)'}
          value={texto}
          maxLength={MAX_TEXTO}
          onChange={(e) => setTexto(e.target.value)}
        />
      </ConfirmationDialog>
    </>
  );
}
