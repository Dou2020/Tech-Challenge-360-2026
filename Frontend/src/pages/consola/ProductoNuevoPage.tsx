import { Link, useNavigate } from 'react-router';
import { Skeleton } from '../../components/atoms';
import { ErrorState, PageHeading } from '../../components/molecules';
import { ProductForm } from '../../components/organisms';
import { useCrearProducto, useTodasLasCategorias } from '../../hooks/queries';

/** Alta de un producto con sus variantes en una sola operación. */
export default function ProductoNuevoPage() {
  const categorias = useTodasLasCategorias();
  const crear = useCrearProducto();
  const navigate = useNavigate();

  return (
    <>
      <PageHeading
        titulo="Nuevo producto"
        descripcion="Crea el producto con al menos una variante. La existencia inicial entra al kardex."
      />
      <Link
        to="/consola/productos"
        className="-mt-4 mb-4 inline-block text-sm text-acento hover:underline"
      >
        ← Volver a productos
      </Link>
      <div className="tarjeta p-5">
        {categorias.isPending && (
          <div role="status" aria-label="Cargando categorías">
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {categorias.isError && (
          <ErrorState error={categorias.error} onReintentar={() => void categorias.refetch()} />
        )}
        {categorias.data && (
          <ProductForm
            categorias={categorias.data}
            onCancelar={() => void navigate('/consola/productos')}
            onGuardar={async (datos) => {
              const producto = await crear.mutateAsync(datos);
              void navigate(`/consola/productos/${producto.idProducto}`, {
                state: { creado: true },
              });
            }}
          />
        )}
      </div>
    </>
  );
}
