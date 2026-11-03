import type { SubmitEvent } from 'react';
import { Button, Input, Select } from '../../components/atoms';
import {
  EmptyState,
  ErrorState,
  PageHeading,
  Pagination,
  SearchBox,
} from '../../components/molecules';
import { ProductGrid, ProductGridSkeleton } from '../../components/organisms';
import { useCategorias, useProductos } from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';

const FILTROS = ['q', 'idCategoria', 'precioMin', 'precioMax', 'disponible'] as const;

const ORDENES = [
  { valor: 'fechaCreacion:desc', etiqueta: 'Más recientes' },
  { valor: 'precio:asc', etiqueta: 'Precio: menor a mayor' },
  { valor: 'precio:desc', etiqueta: 'Precio: mayor a menor' },
  { valor: 'nombre:asc', etiqueta: 'Nombre: A–Z' },
];

export default function CatalogoPage() {
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'fechaCreacion:desc',
    pageSizePorDefecto: 12,
  });
  const { filtros } = tabla;
  const categorias = useCategorias();
  const productos = useProductos(tabla.params);

  const rangoInvalido =
    filtros.precioMin !== '' &&
    filtros.precioMax !== '' &&
    Number(filtros.precioMin) > Number(filtros.precioMax);

  function aplicarPrecio(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    tabla.setFiltros({
      precioMin: String(datos.get('precioMin') ?? '').trim(),
      precioMax: String(datos.get('precioMax') ?? '').trim(),
    });
  }

  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');

  return (
    <>
      <PageHeading titulo="Catálogo" descripcion="Todos los productos disponibles en la tienda." />

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside
          aria-label="Filtros"
          className="tarjeta space-y-4 p-5 lg:sticky lg:top-24 lg:self-start"
        >
          <SearchBox
            etiqueta="Buscar en el catálogo"
            placeholder="Nombre, SKU o categoría…"
            valor={filtros.q}
            onBuscar={(q) => tabla.setFiltros({ q })}
          />
          <Select
            label="Categoría"
            value={filtros.idCategoria}
            onChange={(e) => tabla.setFiltros({ idCategoria: e.target.value })}
          >
            <option value="">Todas</option>
            {categorias.data?.map((c) => (
              <option key={c.idCategoria} value={c.idCategoria}>
                {c.nombre}
              </option>
            ))}
          </Select>
          <Select
            label="Disponibilidad"
            value={filtros.disponible}
            onChange={(e) => tabla.setFiltros({ disponible: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="true">Solo disponibles</option>
            <option value="false">Agotados</option>
          </Select>
          <form
            key={`${filtros.precioMin}|${filtros.precioMax}`}
            onSubmit={aplicarPrecio}
            className="space-y-2"
          >
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Precio mín."
                name="precioMin"
                type="number"
                min={0}
                step="0.01"
                defaultValue={filtros.precioMin}
              />
              <Input
                label="Precio máx."
                name="precioMax"
                type="number"
                min={0}
                step="0.01"
                defaultValue={filtros.precioMax}
              />
            </div>
            {rangoInvalido && (
              <p role="alert" className="text-xs text-peligro-texto">
                El precio mínimo no puede superar al máximo.
              </p>
            )}
            <Button type="submit" variante="secondary" className="w-full">
              Aplicar precio
            </Button>
          </form>
          {hayFiltros && (
            <Button variante="ghost" className="w-full" onClick={tabla.limpiarFiltros}>
              Limpiar filtros
            </Button>
          )}
        </aside>

        <section aria-label="Resultados">
          <div className="mb-4 flex justify-end">
            <div className="w-56">
              <Select
                label="Ordenar por"
                value={tabla.sort ?? ''}
                onChange={(e) => tabla.setSort(e.target.value)}
              >
                {ORDENES.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {productos.isPending && <ProductGridSkeleton />}
          {productos.isError && (
            <ErrorState error={productos.error} onReintentar={() => void productos.refetch()} />
          )}
          {productos.data &&
            (productos.data.items.length === 0 ? (
              <EmptyState
                titulo="No encontramos productos"
                descripcion="Prueba con otros filtros o con otra búsqueda."
                accion={
                  hayFiltros ? (
                    <Button onClick={tabla.limpiarFiltros}>Limpiar filtros</Button>
                  ) : undefined
                }
              />
            ) : (
              <div aria-busy={productos.isPlaceholderData}>
                <ProductGrid productos={productos.data.items} />
                <Pagination
                  page={productos.data.page}
                  pageSize={productos.data.pageSize}
                  total={productos.data.total}
                  onPageChange={tabla.setPage}
                  onPageSizeChange={tabla.setPageSize}
                />
              </div>
            ))}
        </section>
      </div>
    </>
  );
}
