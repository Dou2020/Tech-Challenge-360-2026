import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Badge, Button, Money, Skeleton } from '../../components/atoms';
import {
  ConfirmationDialog,
  ErrorState,
  Notice,
  OrderStatusBadge,
  PageHeading,
} from '../../components/molecules';
import { CouponForm, DataTable, type Columna } from '../../components/organisms';
import {
  useActualizarCupon,
  useCambiarEstadoCupon,
  useCupon,
  useEliminarCupon,
  useTodasLasCategorias,
  useUsosCupon,
} from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import { ApiError } from '../../services/http';
import type { UsoCupon } from '../../types/administracion';
import { estadoDeCupon } from '../../utils/cuponForm';
import { formatearFecha } from '../../utils/format';
import { avisoExito, errorNotice, type Aviso } from '../../utils/notice';
import NoEncontradoPage from '../errores/NoEncontradoPage';

const columnasUsos: Columna<UsoCupon>[] = [
  {
    clave: 'pedido',
    titulo: 'Pedido',
    celda: (u) => (
      <Link
        to={`/consola/pedidos/${u.idPedido}`}
        className="font-medium text-acento hover:underline"
      >
        {u.numeroPedido}
      </Link>
    ),
  },
  {
    clave: 'cliente',
    titulo: 'Cliente',
    celda: (u) => (
      <>
        {u.cliente}
        <span className="block text-xs text-texto-tenue">{u.correo}</span>
      </>
    ),
  },
  {
    clave: 'fecha',
    titulo: 'Fecha',
    orden: 'fecha',
    celda: (u) => <span className="text-texto-suave">{formatearFecha(u.fecha)}</span>,
  },
  {
    clave: 'estado',
    titulo: 'Estado del pedido',
    celda: (u) => <OrderStatusBadge estado={u.estadoPedido} />,
  },
  {
    clave: 'descuento',
    titulo: 'Descuento',
    orden: 'descuento',
    alinear: 'derecha',
    celda: (u) => <Money valor={u.descuento} />,
  },
  {
    clave: 'total',
    titulo: 'Total',
    alinear: 'derecha',
    celda: (u) => <Money valor={u.totalPedido} />,
  },
];

type Dialogo = 'estado' | 'eliminar' | null;

/** Detalle de un cupón: edición, estado, baja y usos paginados. */
export default function CuponDetallePage() {
  const { id } = useParams();
  const idCupon = Number(id);
  const { state } = useLocation() as { state: { creado?: boolean } | null };
  const navigate = useNavigate();
  const cupon = useCupon(idCupon);
  const categorias = useTodasLasCategorias();
  const actualizar = useActualizarCupon(idCupon);
  const cambiarEstado = useCambiarEstadoCupon();
  const eliminar = useEliminarCupon();
  const tablaUsos = useServerTable({
    filtros: [] as const,
    sortPorDefecto: 'fecha:desc',
    pageSizePorDefecto: 10,
  });
  const usos = useUsosCupon(idCupon, tablaUsos.params);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [aviso, setAviso] = useState<Aviso | null>(
    state?.creado ? avisoExito('Cupón creado.') : null,
  );

  if (!Number.isInteger(idCupon) || idCupon < 1) return <NoEncontradoPage />;
  if (cupon.isPending) {
    return (
      <div role="status" aria-label="Cargando cupón" className="space-y-3">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (cupon.isError) {
    if (cupon.error instanceof ApiError && cupon.error.status === 404) return <NoEncontradoPage />;
    return <ErrorState error={cupon.error} onReintentar={() => void cupon.refetch()} />;
  }
  const c = cupon.data;
  const estado = estadoDeCupon(c);

  function confirmar() {
    const cerrar = () => setDialogo(null);
    if (dialogo === 'estado') {
      cambiarEstado.mutate(
        { id: idCupon, activo: !c.activo },
        {
          onSuccess: () =>
            setAviso(avisoExito(c.activo ? 'Cupón desactivado.' : 'Cupón activado.')),
          onError: (error) => setAviso(errorNotice(error, 'No se pudo cambiar el estado.')),
          onSettled: cerrar,
        },
      );
    } else {
      eliminar.mutate(idCupon, {
        onSuccess: () => void navigate('/consola/cupones'),
        onError: (error) =>
          setAviso(
            error instanceof ApiError && error.code === 'EN_USO'
              ? {
                  tipo: 'error',
                  mensaje:
                    'No se puede eliminar: algún pedido o carrito usa este cupón. Desactívalo para que deje de aplicarse.',
                  referencia: error.requestId,
                }
              : errorNotice(error, 'No se pudo eliminar el cupón.'),
          ),
        onSettled: cerrar,
      });
    }
  }

  const eliminando = dialogo === 'eliminar';

  return (
    <>
      <PageHeading
        titulo={`Cupón ${c.codigo}`}
        descripcion={`${c.usosActuales} de ${c.limiteUsosTotal} usos · ${c.cantidadPedidos} pedido(s), ${c.cantidadCarritos} carrito(s)`}
        accion={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tono={estado === 'Vigente' ? 'verde' : estado === 'Inactivo' ? 'gris' : 'ambar'}>
              {estado}
            </Badge>
            <Button variante="secondary" onClick={() => setDialogo('estado')}>
              {c.activo ? 'Desactivar cupón' : 'Activar cupón'}
            </Button>
            <Button variante="secondary" onClick={() => setDialogo('eliminar')}>
              Eliminar cupón
            </Button>
          </div>
        }
      />
      <Link
        to="/consola/cupones"
        className="-mt-4 mb-4 inline-block text-sm text-acento hover:underline"
      >
        ← Volver a cupones
      </Link>

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      <div className="space-y-6">
        <section aria-labelledby="titulo-datos-cupon" className="tarjeta p-5">
          <h2 id="titulo-datos-cupon" className="mb-4 font-semibold tracking-tight text-texto">
            Datos del cupón
          </h2>
          {categorias.isPending && <Skeleton className="h-24 w-full" />}
          {categorias.isError && (
            <ErrorState error={categorias.error} onReintentar={() => void categorias.refetch()} />
          )}
          {categorias.data && (
            <CouponForm
              key={`${c.idCupon}-${c.limiteUsosTotal}-${c.fechaFin}-${c.valor}-${c.codigo}`}
              cupon={c}
              categorias={categorias.data}
              onGuardar={async (datos) => {
                await actualizar.mutateAsync(datos);
                setAviso(avisoExito('Cupón actualizado.'));
              }}
            />
          )}
        </section>

        <section aria-labelledby="titulo-usos" className="tarjeta p-5">
          <h2 id="titulo-usos" className="mb-4 font-semibold tracking-tight text-texto">
            Usos
          </h2>
          <DataTable
            titulo="Usos del cupón"
            columnas={columnasUsos}
            consulta={usos}
            tabla={tablaUsos}
            idFila={(u) => u.idUsoCupon}
            vacio={{ titulo: 'Sin usos', descripcion: 'Ningún pedido activo ha usado este cupón.' }}
          />
        </section>
      </div>

      <ConfirmationDialog
        abierto={dialogo !== null}
        titulo={
          eliminando
            ? `¿Eliminar ${c.codigo}?`
            : c.activo
              ? `¿Desactivar ${c.codigo}?`
              : `¿Activar ${c.codigo}?`
        }
        descripcion={
          eliminando
            ? c.puedeEliminarse
              ? 'No se puede deshacer.'
              : 'Hay pedidos o carritos con este cupón: no se podrá eliminar. Lo mejor es desactivarlo.'
            : c.activo
              ? 'Dejará de aplicarse en carritos nuevos.'
              : 'Volverá a poder aplicarse mientras esté vigente.'
        }
        textoConfirmar={eliminando ? 'Eliminar' : 'Confirmar'}
        cargando={cambiarEstado.isPending || eliminar.isPending}
        onConfirmar={confirmar}
        onCancelar={() => setDialogo(null)}
      />
    </>
  );
}
