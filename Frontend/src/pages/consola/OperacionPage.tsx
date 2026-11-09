import { Link } from 'react-router';
import { Badge, Skeleton } from '../../components/atoms';
import { EmptyState, ErrorState, PageHeading, StatCard } from '../../components/molecules';
import { colaOperacion, infoEstadoPedido } from '../../config';
import { useExistencias, useTotalesPedidos } from '../../hooks/queries';

const ESTADOS_COLA = colaOperacion.map((c) => c.estado);

/** Variantes activas en bajo stock, de la menos disponible a la más. */
const PARAMS_BAJO_STOCK = {
  bajoStock: 'true',
  activo: 'true',
  sort: 'existenciaDisponible:asc',
  page: 1,
  pageSize: 5,
};
const RUTA_BAJO_STOCK = '/consola/inventario?bajoStock=true&activo=true';

/**
 * Panel de operación (Operador y Administrador; es el inicio del Operador): cuántos pedidos esperan
 * en cada etapa y qué variantes están por agotarse, con enlaces a las listas ya filtradas.
 */
export default function OperacionPage() {
  const cola = useTotalesPedidos(ESTADOS_COLA);
  const bajoStock = useExistencias(PARAMS_BAJO_STOCK);
  const error = cola.error ?? (bajoStock.isError ? bajoStock.error : null);
  const reintentar = () => {
    cola.refetch();
    void bajoStock.refetch();
  };

  return (
    <>
      <PageHeading
        titulo="Operación"
        descripcion="Lo que espera una acción: pedidos por etapa y variantes con poca existencia."
      />

      {error ? (
        <ErrorState error={error} onReintentar={reintentar} />
      ) : cola.isPending || bajoStock.isPending ? (
        <div
          role="status"
          aria-label="Cargando panel de operación"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {colaOperacion.map(({ estado, etiqueta }, i) => (
              <StatCard
                key={estado}
                titulo={etiqueta}
                valor={cola.totales[i] ?? 0}
                ayuda={`Pedidos en estado ${infoEstadoPedido(estado).etiqueta}`}
                enlace={{ to: `/consola/pedidos?estado=${estado}`, texto: 'Ver pedidos' }}
              />
            ))}
            <StatCard
              titulo="Bajo stock"
              valor={bajoStock.data?.total ?? 0}
              ayuda="Variantes activas en su umbral o por debajo"
              enlace={{ to: RUTA_BAJO_STOCK, texto: 'Ver inventario' }}
            />
          </dl>

          <section aria-labelledby="titulo-bajo-stock" className="mt-8">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="titulo-bajo-stock" className="font-semibold tracking-tight text-texto">
                Variantes por agotarse
              </h2>
              <Link
                to={RUTA_BAJO_STOCK}
                className="text-sm font-medium text-acento hover:underline"
              >
                Ver todas
              </Link>
            </div>
            {bajoStock.data?.items.length ? (
              <div className="tarjeta overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <caption className="sr-only">Variantes por agotarse</caption>
                  <thead className="border-b border-borde bg-superficie-suave/60 text-xs font-medium tracking-wide text-texto-tenue uppercase">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        SKU
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Producto
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Disponible
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Umbral
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {bajoStock.data.items.map((e) => (
                      <tr key={e.idVariante}>
                        <td className="px-4 py-3 font-medium text-texto">{e.sku}</td>
                        <td className="px-4 py-3 text-texto-suave">
                          <span className="block">{e.producto}</span>
                          {e.descripcion && (
                            <span className="block text-xs text-texto-tenue">{e.descripcion}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-peligro-texto tabular-nums">
                          <span className="inline-flex items-center justify-end gap-2">
                            {e.existenciaDisponible <= 0 && <Badge tono="rojo">Agotado</Badge>}
                            {e.existenciaDisponible}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-texto-suave tabular-nums">
                          {e.umbralBajoStock}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/consola/inventario/${e.idVariante}/kardex`}
                            state={{ sku: e.sku, producto: e.producto, descripcion: e.descripcion }}
                            aria-label={`Ver kardex de ${e.sku}`}
                            className="rounded-lg border border-borde-fuerte px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie-suave"
                          >
                            Kardex
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                titulo="Ninguna variante en bajo stock"
                descripcion="Todas las variantes activas están por encima de su umbral."
              />
            )}
          </section>
        </>
      )}
    </>
  );
}
