import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../auth/useAuth';
import { Button, Skeleton } from '../../components/atoms';
import {
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  Notice,
  PageHeading,
} from '../../components/molecules';
import { CartLine, CartSummary, CouponInput } from '../../components/organisms';
import {
  useActualizarCantidad,
  useAplicarCupon,
  useCarrito,
  useEliminarItem,
  useQuitarCupon,
  useVaciarCarrito,
} from '../../hooks/queries';
import { ApiError } from '../../services/http';
import { errorNotice, type Aviso } from '../../utils/notice';

function irAlCatalogo() {
  return (
    <Link to="/catalogo" className="text-sm font-medium text-acento hover:underline">
      Ver el catálogo
    </Link>
  );
}

export default function CarritoPage() {
  const { usuario, estado } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const carrito = useCarrito();
  const actualizar = useActualizarCantidad();
  const eliminar = useEliminarItem();
  const vaciar = useVaciarCarrito();
  const aplicar = useAplicarCupon();
  const quitar = useQuitarCupon();
  // El checkout manda aquí con un aviso (reserva vencida, carrito vacío…) en el state de navegación.
  const [aviso, setAviso] = useState<Aviso | null>(
    (location.state as { aviso?: Aviso } | null)?.aviso ?? null,
  );
  const [confirmarVaciar, setConfirmarVaciar] = useState(false);

  const esCliente = usuario?.rol === 'Cliente';
  const esPersonal = !!usuario && !esCliente;
  const ocupado =
    actualizar.isPending || eliminar.isPending || vaciar.isPending || quitar.isPending;

  const titulo = <PageHeading titulo="Carrito de compras" />;

  if (esPersonal) {
    return (
      <>
        {titulo}
        <EmptyState
          titulo="Las cuentas del personal no tienen carrito"
          descripcion="Inicia sesión como cliente para comprar."
          accion={irAlCatalogo()}
        />
      </>
    );
  }

  // Carga: la sesión se está restaurando o la consulta está en curso. Un invitado sin token
  // tiene la consulta deshabilitada: eso es un carrito vacío, no una carga infinita.
  if (estado === 'cargando' || carrito.isLoading) {
    return (
      <>
        {titulo}
        <div role="status" aria-label="Cargando carrito" className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </>
    );
  }

  if (carrito.isError) {
    return (
      <>
        {titulo}
        <ErrorState error={carrito.error} onReintentar={() => void carrito.refetch()} />
      </>
    );
  }

  const datos = carrito.data;
  if (!datos || datos.items.length === 0) {
    return (
      <>
        {titulo}
        {aviso && (
          <div className="mb-4">
            <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
          </div>
        )}
        <EmptyState
          titulo="Tu carrito está vacío"
          descripcion="Agrega productos desde el catálogo para empezar."
          accion={irAlCatalogo()}
        />
      </>
    );
  }

  const alFallar = (error: unknown) => {
    const base = errorNotice(error, 'No se pudo actualizar el carrito.');
    if (error instanceof ApiError && error.code === 'STOCK_INSUFICIENTE') {
      const detalle = error.details.map((d) => d.message).join(' ');
      setAviso({ ...base, mensaje: detalle ? `${base.mensaje} ${detalle}.` : base.mensaje });
      void carrito.refetch();
    } else {
      setAviso(base);
    }
  };

  const cambiarCantidad = (idVariante: number, cantidad: number) => {
    setAviso(null);
    actualizar.mutate({ idVariante, cantidad }, { onError: alFallar });
  };
  const quitarLinea = (idVariante: number) => {
    setAviso(null);
    eliminar.mutate(idVariante, { onError: alFallar });
  };
  const confirmarVaciado = () =>
    vaciar.mutate(undefined, {
      onSuccess: () => setConfirmarVaciar(false),
      onError: (error) => {
        setConfirmarVaciar(false);
        alFallar(error);
      },
    });

  const bloqueado = datos.lineasRequierenAjuste > 0;
  const irAPagar = () => navigate(esCliente ? '/checkout' : '/login?redirect=/checkout');

  return (
    <>
      <PageHeading
        titulo="Carrito de compras"
        accion={
          <Button variante="ghost" onClick={() => setConfirmarVaciar(true)} disabled={ocupado}>
            Vaciar carrito
          </Button>
        }
      />

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <ul className="space-y-3" aria-label="Productos del carrito">
          {datos.items.map((linea) => (
            <CartLine
              key={linea.idCarritoDetalle}
              linea={linea}
              ocupado={ocupado}
              onCantidad={cambiarCantidad}
              onQuitar={quitarLinea}
            />
          ))}
        </ul>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="tarjeta p-5">
            <CouponInput
              cupon={datos.cupon}
              esCliente={esCliente}
              cargando={aplicar.isPending || quitar.isPending}
              error={aplicar.error instanceof ApiError ? aplicar.error.message : null}
              onAplicar={(codigo) => aplicar.mutate(codigo)}
              onQuitar={() => {
                aplicar.reset();
                quitar.mutate(undefined, { onError: alFallar });
              }}
            />
          </div>

          <CartSummary carrito={datos}>
            {bloqueado && (
              <p role="alert" className="text-sm text-aviso-texto">
                Ajusta las líneas marcadas para poder pagar.
              </p>
            )}
            <Button className="w-full" onClick={irAPagar} disabled={bloqueado || ocupado}>
              Ir a pagar
            </Button>
          </CartSummary>
        </div>
      </div>

      <ConfirmationDialog
        abierto={confirmarVaciar}
        titulo="¿Vaciar el carrito?"
        descripcion="Se quitarán todos los productos y el cupón."
        textoConfirmar="Vaciar"
        cargando={vaciar.isPending}
        onConfirmar={confirmarVaciado}
        onCancelar={() => setConfirmarVaciar(false)}
      />
    </>
  );
}
