import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Badge, Button, Skeleton } from '../../components/atoms';
import { ConfirmationDialog, ErrorState, Notice, PageHeading } from '../../components/molecules';
import { ProductForm, ProductImagesManager, VariantsManager } from '../../components/organisms';
import {
  useActualizarProducto,
  useAgregarImagen,
  useSubirImagen,
  useCambiarEstadoProducto,
  useEliminarProducto,
  useProductoGestion,
  useQuitarImagen,
  useTodasLasCategorias,
} from '../../hooks/queries';
import { ApiError } from '../../services/http';
import { formatearFecha } from '../../utils/format';
import { avisoExito, errorNotice, type Aviso } from '../../utils/notice';
import NoEncontradoPage from '../errores/NoEncontradoPage';

type Dialogo = 'estado' | 'eliminar' | null;

function Seccion({
  id,
  titulo,
  children,
}: {
  id: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="tarjeta p-5">
      <h2 id={id} className="mb-4 font-semibold tracking-tight text-texto">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** Edición de un producto: datos, estado, baja, imágenes y variantes (con cambio de precio). */
export default function ProductoEditarPage() {
  const { id } = useParams();
  const idProducto = Number(id);
  const { state } = useLocation() as { state: { creado?: boolean } | null };
  const navigate = useNavigate();
  const producto = useProductoGestion(idProducto);
  const categorias = useTodasLasCategorias();
  const actualizar = useActualizarProducto(idProducto);
  const cambiarEstado = useCambiarEstadoProducto(idProducto);
  const eliminar = useEliminarProducto(idProducto);
  const agregarImagen = useAgregarImagen(idProducto);
  const subirImagen = useSubirImagen(idProducto);
  const quitarImagen = useQuitarImagen(idProducto);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [aviso, setAviso] = useState<Aviso | null>(
    state?.creado ? avisoExito('Producto creado. Puedes completar imágenes y variantes.') : null,
  );

  if (!Number.isInteger(idProducto) || idProducto < 1) return <NoEncontradoPage />;
  if (producto.isPending) {
    return (
      <div role="status" aria-label="Cargando producto" className="space-y-3">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (producto.isError) {
    if (producto.error instanceof ApiError && producto.error.status === 404)
      return <NoEncontradoPage />;
    return <ErrorState error={producto.error} onReintentar={() => void producto.refetch()} />;
  }
  const p = producto.data;

  function confirmar() {
    const cerrar = () => setDialogo(null);
    if (dialogo === 'estado') {
      cambiarEstado.mutate(!p.activo, {
        onSuccess: () =>
          setAviso(
            avisoExito(
              p.activo ? 'Producto desactivado: ya no se ve en la tienda.' : 'Producto activado.',
            ),
          ),
        onError: (error) => setAviso(errorNotice(error, 'No se pudo cambiar el estado.')),
        onSettled: cerrar,
      });
    } else {
      eliminar.mutate(undefined, {
        onSuccess: () => void navigate('/consola/productos'),
        onError: (error) =>
          setAviso(
            error instanceof ApiError &&
              (error.code === 'PRODUCTO_CON_VENTAS' || error.code === 'EN_USO')
              ? {
                  tipo: 'error',
                  mensaje:
                    error.code === 'PRODUCTO_CON_VENTAS'
                      ? 'No se puede eliminar: el producto tiene ventas. Desactívalo para ocultarlo de la tienda.'
                      : 'No se puede eliminar: el producto tiene historial de inventario o reservas. Desactívalo para ocultarlo de la tienda.',
                  referencia: error.requestId,
                }
              : errorNotice(error, 'No se pudo eliminar el producto.'),
          ),
        onSettled: cerrar,
      });
    }
  }

  const eliminando = dialogo === 'eliminar';

  return (
    <>
      <PageHeading
        titulo={p.nombre}
        descripcion={`${p.categoria} · creado el ${formatearFecha(p.fechaCreacion)}`}
        accion={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tono={p.activo ? 'verde' : 'gris'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
            <Button variante="secondary" onClick={() => setDialogo('estado')}>
              {p.activo ? 'Desactivar producto' : 'Activar producto'}
            </Button>
            <Button variante="secondary" onClick={() => setDialogo('eliminar')}>
              Eliminar producto
            </Button>
          </div>
        }
      />
      <Link
        to="/consola/productos"
        className="-mt-4 mb-4 inline-block text-sm text-acento hover:underline"
      >
        ← Volver a productos
      </Link>

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      <div className="space-y-6">
        <Seccion id="titulo-datos" titulo="Datos del producto">
          {categorias.isPending && <Skeleton className="h-24 w-full" />}
          {categorias.isError && (
            <ErrorState error={categorias.error} onReintentar={() => void categorias.refetch()} />
          )}
          {categorias.data && (
            <ProductForm
              key={p.fechaModificacion ?? p.fechaCreacion}
              producto={p}
              categorias={categorias.data}
              onGuardar={async (datos) => {
                await actualizar.mutateAsync(datos);
                setAviso(avisoExito('Producto actualizado.'));
              }}
            />
          )}
        </Seccion>

        <Seccion id="titulo-imagenes" titulo="Imágenes">
          <ProductImagesManager
            imagenes={p.imagenes}
            onAgregar={async (datos) => {
              await agregarImagen.mutateAsync(datos);
              setAviso(avisoExito('Imagen agregada.'));
            }}
            onSubirArchivo={async (datos) => {
              await subirImagen.mutateAsync(datos);
              setAviso(avisoExito('Imagen subida.'));
            }}
            onQuitar={async (idImagen) => {
              await quitarImagen.mutateAsync(idImagen);
              setAviso(avisoExito('Imagen eliminada.'));
            }}
          />
        </Seccion>

        <Seccion id="titulo-variantes" titulo="Variantes">
          <VariantsManager producto={p} onAviso={setAviso} />
        </Seccion>
      </div>

      <ConfirmationDialog
        abierto={dialogo !== null}
        titulo={
          eliminando
            ? `¿Eliminar "${p.nombre}"?`
            : p.activo
              ? `¿Desactivar "${p.nombre}"?`
              : `¿Activar "${p.nombre}"?`
        }
        descripcion={
          eliminando
            ? p.puedeEliminarse
              ? 'Se borrarán sus imágenes, variantes y líneas de carrito. No se puede deshacer.'
              : 'Este producto tiene historial (ventas, kardex o reservas) y no se puede eliminar; lo mejor es desactivarlo.'
            : p.activo
              ? 'Dejará de verse en la tienda.'
              : 'Volverá a verse en la tienda.'
        }
        textoConfirmar={eliminando ? 'Eliminar' : 'Confirmar'}
        cargando={cambiarEstado.isPending || eliminar.isPending}
        onConfirmar={confirmar}
        onCancelar={() => setDialogo(null)}
      />
    </>
  );
}
