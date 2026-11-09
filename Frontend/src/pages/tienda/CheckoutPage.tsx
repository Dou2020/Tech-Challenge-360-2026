import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Button, Skeleton } from '../../components/atoms';
import { ErrorState, Notice, PageHeading, ReservationTimer } from '../../components/molecules';
import { CheckoutSelection, CheckoutSummary, PaymentForm } from '../../components/organisms';
import {
  CLAVE_CARRITO,
  CLAVE_PEDIDOS,
  CLAVE_TARJETAS,
  esReservaVencida,
  useCarrito,
  useIniciarCheckout,
  useLiberarReserva,
  usePagar,
  useResumenCheckout,
  useTarjetas,
} from '../../hooks/queries';
import { ApiError } from '../../services/http';
import type { DetalleError } from '../../types/api';
import type { DatosPago, EntregaCheckout } from '../../types/checkout';
import { idempotencia } from '../../utils/idempotencia';
import { avisoInfo, errorNotice, type Aviso } from '../../utils/notice';

const entero = (valor: string | null): number | null => {
  const n = Number(valor);
  return valor && Number.isInteger(n) && n > 0 ? n : null;
};

export default function CheckoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const idDireccion = entero(params.get('idDireccion'));
  const idSucursal = entero(params.get('idSucursal'));
  const idMetodoEnvio = entero(params.get('idMetodoEnvio'));
  const tieneEntrega = idDireccion !== null || idSucursal !== null;

  const carrito = useCarrito();
  const resumenQ = useResumenCheckout(tieneEntrega ? idMetodoEnvio : null);
  const iniciar = useIniciarCheckout();
  const liberar = useLiberarReserva();
  const pagar = usePagar();
  const tarjetas = useTarjetas();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [detalles, setDetalles] = useState<DetalleError[]>([]);
  const pagoEnCurso = useRef(false);

  const aCarrito = (mensaje: string) =>
    navigate('/carrito', { replace: true, state: { aviso: avisoInfo(mensaje) } });

  /** Errores comunes de iniciar y pagar. Devuelve true si ya se atendió (navegó o avisó). */
  function mostrarError(error: unknown) {
    setDetalles([]);
    if (esReservaVencida(error)) {
      idempotencia.descartar();
      aCarrito('Tu reserva venció. Revisa tu carrito e inicia el pago de nuevo.');
      return;
    }
    if (error instanceof ApiError && error.code === 'STOCK_INSUFICIENTE') {
      setDetalles(error.details);
    }
    // La tarjeta guardada ya no existe (404 aun repitiendo la clave): se refresca la lista.
    if (error instanceof ApiError && error.code === 'NO_ENCONTRADO') {
      void queryClient.invalidateQueries({ queryKey: CLAVE_TARJETAS });
    }
    setAviso(errorNotice(error, 'No se pudo completar la operación.'));
  }

  function continuar(entrega: EntregaCheckout) {
    setAviso(null);
    setDetalles([]);
    iniciar.mutate(entrega, {
      onSuccess: () =>
        setParams({
          ...(entrega.idDireccion !== undefined
            ? { idDireccion: String(entrega.idDireccion) }
            : {}),
          ...(entrega.idSucursal !== undefined ? { idSucursal: String(entrega.idSucursal) } : {}),
          idMetodoEnvio: String(entrega.idMetodoEnvio),
        }),
      onError: mostrarError,
    });
  }

  async function pagarAhora(datos: DatosPago) {
    // Doble clic o doble envío: una sola petición en curso, con una sola clave.
    if (pagoEnCurso.current || !tieneEntrega || idMetodoEnvio === null) return;
    pagoEnCurso.current = true;
    setAviso(null);
    setDetalles([]);
    const clave = idempotencia.obtenerOCrear();
    try {
      const pedido = await pagar.mutateAsync({
        solicitud: {
          idMetodoEnvio,
          ...(idSucursal !== null ? { idSucursal } : { idDireccion: idDireccion as number }),
          metodoPago: 'TARJETA',
          datosPago: datos,
        },
        clave,
      });
      idempotencia.descartar();
      navigate(`/pedido-confirmado/${pedido.idPedido}`, { replace: true });
      void queryClient.invalidateQueries({ queryKey: CLAVE_CARRITO });
      void queryClient.invalidateQueries({ queryKey: CLAVE_PEDIDOS });
      if (pedido.idTarjetaGuardada !== null) {
        void queryClient.invalidateQueries({ queryKey: CLAVE_TARJETAS });
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'IDEMPOTENCIA_CONFLICTO') {
        // La clave quedó asociada a otro carrito: se descarta y el siguiente intento crea una nueva.
        idempotencia.descartar();
        setAviso({
          ...errorNotice(error),
          mensaje: 'No pudimos confirmar el pago. Inténtalo de nuevo.',
        });
      } else {
        // 402 PAGO_RECHAZADO: el SP rechaza la tarjeta 0000 antes de escribir nada, así que la clave
        // no queda registrada ni la reserva se libera. Se conserva la clave: el reintento (con otra
        // tarjeta) sigue siendo el mismo intento de compra del mismo carrito.
        mostrarError(error);
      }
    } finally {
      pagoEnCurso.current = false;
    }
  }

  function volverAlCarrito() {
    idempotencia.descartar();
    liberar.mutate(undefined, { onSettled: () => navigate('/carrito') });
  }

  const resumen = resumenQ.data;
  const titulo = <PageHeading titulo="Finalizar compra" />;

  // Paso 2: hay reserva vigente.
  if (resumen && tieneEntrega && idMetodoEnvio !== null) {
    return (
      <>
        {titulo}
        <div className="mb-4">
          {resumen.reservaExpiraEn && (
            <ReservationTimer
              expiraEn={resumen.reservaExpiraEn}
              onVencida={() =>
                aCarrito('Tu reserva venció. Revisa tu carrito e inicia el pago de nuevo.')
              }
            />
          )}
        </div>
        {aviso && (
          <div className="mb-4 space-y-2">
            <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
            <DetallesStock detalles={detalles} />
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          {tarjetas.isPending ? (
            <div role="status" aria-label="Cargando tarjetas">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <PaymentForm
              // Se recrea si cambia la lista (p. ej. una tarjeta eliminada) para reelegir la preseleccionada.
              key={(tarjetas.data ?? []).map((t) => t.idTarjeta).join('-')}
              tarjetas={tarjetas.data ?? []}
              onPagar={pagarAhora}
              deshabilitado={liberar.isPending}
            />
          )}
          <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            <CheckoutSummary resumen={resumen} />
            <Button
              variante="ghost"
              className="w-full"
              onClick={volverAlCarrito}
              cargando={liberar.isPending}
            >
              Volver al carrito
            </Button>
          </div>
        </div>
      </>
    );
  }

  // Retomando tras recargar: se consulta la reserva vigente.
  if (resumenQ.isPending && resumenQ.fetchStatus !== 'idle') {
    return (
      <>
        {titulo}
        <div role="status" aria-label="Retomando tu pago" className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }
  if (resumenQ.isError && !esReservaVencida(resumenQ.error)) {
    return (
      <>
        {titulo}
        <ErrorState error={resumenQ.error} onReintentar={() => void resumenQ.refetch()} />
      </>
    );
  }

  // Carrito vacío: no hay nada que pagar.
  if (carrito.data && carrito.data.items.length === 0) {
    return (
      <Navigate to="/carrito" replace state={{ aviso: avisoInfo('Tu carrito está vacío.') }} />
    );
  }

  // Paso 1: método de envío y dirección o sucursal.
  return (
    <>
      {titulo}
      {resumenQ.isError && (
        <div className="mb-4">
          <Notice
            aviso={avisoInfo(
              'Tu reserva ya no está vigente. Confirma la entrega para reservarla de nuevo.',
            )}
          />
        </div>
      )}
      {aviso && (
        <div className="mb-4 space-y-2">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
          <DetallesStock detalles={detalles} />
        </div>
      )}
      <CheckoutSelection
        idDireccionInicial={idDireccion}
        idMetodoEnvioInicial={idMetodoEnvio}
        idSucursalInicial={idSucursal}
        iniciando={iniciar.isPending}
        onContinuar={continuar}
      />
    </>
  );
}

/** Variantes sin existencia suficiente (details de 409 STOCK_INSUFICIENTE), con enlace al carrito. */
function DetallesStock({ detalles }: { detalles: DetalleError[] }) {
  if (detalles.length === 0) return null;
  return (
    <div className="rounded-xl border border-aviso-borde bg-aviso-suave px-4 py-3 text-sm text-aviso-texto">
      <ul className="list-disc pl-5">
        {detalles.map((d) => (
          <li key={d.field}>{d.message}</li>
        ))}
      </ul>
      <Link to="/carrito" className="mt-2 inline-block font-medium underline">
        Ajustar el carrito
      </Link>
    </div>
  );
}
