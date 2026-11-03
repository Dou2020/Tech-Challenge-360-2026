import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '../../components/molecules';
import { ProductGrid, ProductGridSkeleton } from '../../components/organisms';
import { Skeleton } from '../../components/atoms';
import { useCategorias, useProductos } from '../../hooks/queries';

const RECIENTES = { page: 1, pageSize: 8, sort: 'fechaCreacion:desc' };

export default function HomePage() {
  const categorias = useCategorias();
  const recientes = useProductos(RECIENTES);

  return (
    <div className="space-y-14">
      <section className="relative overflow-hidden rounded-3xl bg-superficie px-6 py-14 shadow-xs ring-1 ring-borde sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-primario/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 left-1/4 size-80 rounded-full bg-acento/10 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight text-balance text-texto sm:text-5xl">
            Bienvenido a ShopCart
          </h1>
          <p className="mt-4 max-w-xl text-base text-pretty text-texto-suave sm:text-lg">
            Encuentra lo que buscas, paga seguro y recibe tu pedido en cualquier parte de Guatemala.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/catalogo"
              className="inline-flex items-center gap-2 rounded-lg bg-primario px-5 py-2.5 text-sm font-medium text-sobre-primario shadow-xs transition-colors hover:bg-primario-hover"
            >
              Ver el catálogo
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a
              href="#titulo-categorias"
              className="inline-flex items-center rounded-lg bg-superficie px-5 py-2.5 text-sm font-medium text-texto shadow-xs ring-1 ring-borde-fuerte transition-colors ring-inset hover:bg-superficie-suave"
            >
              Explorar categorías
            </a>
          </div>
        </div>
      </section>

      <section aria-labelledby="titulo-categorias">
        <h2
          id="titulo-categorias"
          className="mb-4 scroll-mt-24 text-xl font-semibold tracking-tight text-texto"
        >
          Categorías
        </h2>
        {categorias.isPending && (
          <div role="status" aria-label="Cargando categorías" className="flex gap-3">
            <Skeleton className="h-10 w-28 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        )}
        {categorias.isError && (
          <ErrorState error={categorias.error} onReintentar={() => void categorias.refetch()} />
        )}
        {categorias.data &&
          (categorias.data.length === 0 ? (
            <EmptyState titulo="Aún no hay categorías" />
          ) : (
            <ul className="flex flex-wrap gap-3">
              {categorias.data.map((categoria) => (
                <li key={categoria.idCategoria}>
                  <Link
                    to={`/catalogo?idCategoria=${categoria.idCategoria}`}
                    className="inline-flex items-center gap-2 rounded-full bg-superficie py-2 pr-2 pl-4 text-sm font-medium text-texto shadow-xs ring-1 ring-borde transition hover:ring-primario"
                  >
                    {categoria.nombre}
                    <span className="rounded-full bg-superficie-suave px-2 py-0.5 text-xs text-texto-suave tabular-nums">
                      {categoria.cantidadProductos}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section aria-labelledby="titulo-recientes">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="titulo-recientes" className="text-xl font-semibold tracking-tight text-texto">
            Productos recientes
          </h2>
          <Link to="/catalogo" className="text-sm font-medium text-acento hover:underline">
            Ver todos
          </Link>
        </div>
        {recientes.isPending && <ProductGridSkeleton />}
        {recientes.isError && (
          <ErrorState error={recientes.error} onReintentar={() => void recientes.refetch()} />
        )}
        {recientes.data &&
          (recientes.data.items.length === 0 ? (
            <EmptyState titulo="Todavía no hay productos" descripcion="Vuelve pronto." />
          ) : (
            <ProductGrid productos={recientes.data.items} />
          ))}
      </section>
    </div>
  );
}
