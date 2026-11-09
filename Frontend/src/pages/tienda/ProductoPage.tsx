import { ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth';
import { Badge, Button, Money, Skeleton } from '../../components/atoms';
import { ErrorState, Notice, QuantityStepper } from '../../components/molecules';
import { ProductGallery, VariantSelector } from '../../components/organisms';
import { useAgregarItem, useCarrito, useProducto } from '../../hooks/queries';
import { useSeleccionVariante } from '../../hooks/useSeleccionVariante';
import { ApiError } from '../../services/http';
import type { ProductoDetalle } from '../../types/catalogo';
import { avisoExito, errorNotice, type Aviso } from '../../utils/notice';
import { productoEnCarrito, type ProductoEnCarrito } from '../../utils/variantes';
import NoEncontradoPage from '../errores/NoEncontradoPage';

function ProductoCargando() {
  return (
    <div role="status" aria-label="Cargando producto" className="grid gap-8 md:grid-cols-2">
      <Skeleton className="aspect-square" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

interface PropsDetalle {
  producto: ProductoDetalle;
  /** Lo que ya hay de este producto en el carrito: fija la variante inicial y baja el tope. */
  carrito: ProductoEnCarrito;
}

function DetalleProducto({ producto, carrito }: PropsDetalle) {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const agregar = useAgregarItem();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const seleccion = useSeleccionVariante(producto.variantes, {
    idVarianteInicial: carrito.idVarianteReciente,
    enCarrito: carrito.porVariante,
  });
  const { variante, enCarrito, maximo, cantidad } = seleccion;
  // Hay existencia, pero toda ya está en el carrito.
  const todoEnCarrito = !!variante && maximo === 0 && variante.existenciaDisponible > 0;

  // Operador y Administrador no tienen carrito.
  const puedeComprar = !usuario || usuario.rol === 'Cliente';

  function agregarAlCarrito() {
    if (!variante) return;
    setAviso(null);
    agregar.mutate(
      { idVariante: variante.idVariante, cantidad },
      {
        onSuccess: () => {
          setAviso(avisoExito('Agregado al carrito.'));
          // La API suma: el contador vuelve a 1 y "En tu carrito" ya muestra el total.
          seleccion.setCantidad(1);
        },
        onError: (error) => {
          const base = errorNotice(error, 'No se pudo agregar al carrito.');
          if (error instanceof ApiError && error.code === 'STOCK_INSUFICIENTE') {
            const detalle = error.details.map((d) => d.message).join(' ');
            setAviso({ ...base, mensaje: detalle ? `${base.mensaje} ${detalle}.` : base.mensaje });
            // La existencia cambió: se vuelve a leer del servidor.
            void queryClient.invalidateQueries({
              queryKey: ['catalogo', 'producto', producto.idProducto],
            });
          } else {
            setAviso(base);
          }
        },
      },
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-2 lg:gap-12">
      <ProductGallery imagenes={producto.imagenes} nombre={producto.nombre} />

      <div className="space-y-6 md:sticky md:top-24 md:self-start">
        <div>
          <Link
            to={`/catalogo?idCategoria=${producto.idCategoria}`}
            className="text-sm text-acento hover:underline"
          >
            {producto.categoria}
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance text-texto">
            {producto.nombre}
          </h1>
        </div>

        <p className="text-3xl font-semibold tracking-tight text-texto">
          {variante ? (
            <Money valor={variante.precio} />
          ) : (
            <>
              <Money valor={producto.precioMinimo} />
              {producto.precioMinimo !== producto.precioMaximo && (
                <>
                  {' '}
                  – <Money valor={producto.precioMaximo} />
                </>
              )}
            </>
          )}
        </p>

        {producto.descripcion && <p className="text-sm text-texto-suave">{producto.descripcion}</p>}

        <VariantSelector
          grupos={seleccion.grupos}
          seleccion={seleccion.seleccion}
          onElegir={seleccion.elegir}
        />

        {variante ? (
          <div className="space-y-1 text-sm text-texto-suave">
            <p>
              SKU {variante.sku} ·{' '}
              {variante.existenciaDisponible > 0 ? (
                <span>{variante.existenciaDisponible} disponibles</span>
              ) : (
                <Badge tono="rojo">Agotado</Badge>
              )}
            </p>
            {puedeComprar && enCarrito > 0 && (
              <p>
                En tu carrito: {enCarrito} ·{' '}
                <Link to="/carrito" className="font-medium text-acento hover:underline">
                  Ver carrito
                </Link>
              </p>
            )}
            {puedeComprar && todoEnCarrito && (
              <p role="status" className="text-aviso-texto">
                Ya tienes en tu carrito todo lo disponible.
              </p>
            )}
          </div>
        ) : (
          <p role="status" className="text-sm text-aviso-texto">
            Esa combinación no está disponible. Elige otra.
          </p>
        )}

        {aviso && <Notice aviso={aviso} onCerrar={() => setAviso(null)} />}

        {puedeComprar ? (
          <div className="flex flex-wrap items-center gap-3">
            <QuantityStepper valor={cantidad} onChange={seleccion.setCantidad} max={maximo} />
            <Button onClick={agregarAlCarrito} disabled={maximo === 0} cargando={agregar.isPending}>
              <ShoppingCart className="size-4" aria-hidden />
              Agregar al carrito
            </Button>
          </div>
        ) : (
          <p className="text-sm text-texto-tenue">
            Las cuentas del personal no tienen carrito de compras.
          </p>
        )}

        {aviso?.tipo === 'exito' && enCarrito === 0 && (
          <Link
            to="/carrito"
            className="inline-block text-sm font-medium text-acento hover:underline"
          >
            Ir al carrito
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ProductoPage() {
  const { id } = useParams();
  const idProducto = Number(id);
  const producto = useProducto(idProducto);
  // Deshabilitada para el personal y para el invitado sin token: entonces no está cargando.
  const carrito = useCarrito();
  const items = carrito.data?.items;
  const enCarrito = useMemo(() => productoEnCarrito(items ?? [], idProducto), [items, idProducto]);

  if (!Number.isInteger(idProducto) || idProducto < 1) return <NoEncontradoPage />;
  // Se espera al carrito porque la variante inicial se fija una sola vez al montar.
  if (producto.isPending || carrito.isLoading) return <ProductoCargando />;
  if (producto.isError) {
    if (producto.error instanceof ApiError && producto.error.status === 404) {
      return <NoEncontradoPage />;
    }
    return <ErrorState error={producto.error} onReintentar={() => void producto.refetch()} />;
  }
  // La clave reinicia la selección si cambia de producto.
  return (
    <DetalleProducto key={producto.data.idProducto} producto={producto.data} carrito={enCarrito} />
  );
}
