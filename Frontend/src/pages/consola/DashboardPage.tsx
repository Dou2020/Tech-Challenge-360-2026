import { lazy, Suspense } from 'react';
import { Select, Skeleton } from '../../components/atoms';
import { DateRangeFilter, PageHeading, ReportSection, StatCard } from '../../components/molecules';
import {
  useProductosMasVendidos,
  useResumenReportes,
  useVentasPorCategoria,
  useVentasPorPeriodo,
} from '../../hooks/queries';
import { AGRUPACIONES, useAgrupacion } from '../../hooks/useAgrupacion';
import { useRangoFechas } from '../../hooks/useRangoFechas';
import { EstadoSistema } from '../../components/organisms/EstadoSistema';
import { formatearMonto } from '../../utils/format';

// recharts pesa bastante: las gráficas se descargan solo al abrir el dashboard.
const SalesChart = lazy(() =>
  import('../../components/organisms/SalesChart').then((m) => ({ default: m.SalesChart })),
);
const CategorySalesChart = lazy(() =>
  import('../../components/organisms/CategorySalesChart').then((m) => ({
    default: m.CategorySalesChart,
  })),
);
const TopProductsChart = lazy(() =>
  import('../../components/organisms/TopProductsChart').then((m) => ({
    default: m.TopProductsChart,
  })),
);

function CargandoGrafica() {
  return (
    <div role="status" aria-label="Cargando gráfica">
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/** Dashboard del Administrador: indicadores y gráficas del periodo (últimos 30 días por defecto). */
export default function DashboardPage() {
  const rango = useRangoFechas();
  const { agrupacion, setAgrupacion } = useAgrupacion();

  const consulta = { desde: rango.desde, hasta: rango.hasta };
  const resumen = useResumenReportes(consulta, rango.valido);
  const ventas = useVentasPorPeriodo(consulta, agrupacion, rango.valido);
  const categorias = useVentasPorCategoria(consulta, rango.valido);
  const top = useProductosMasVendidos(consulta, 10, rango.valido);

  return (
    <>
      <PageHeading
        titulo="Dashboard"
        descripcion="Ventas netas de pedidos completados, sin envío. Días de Guatemala."
      />
      <DateRangeFilter
        desde={rango.desde}
        hasta={rango.hasta}
        valido={rango.valido}
        esPorDefecto={rango.esPorDefecto}
        onCambiar={rango.setRango}
        onRestablecer={rango.restablecer}
      />

      <div className="mb-6">
        <ReportSection titulo="Indicadores" consulta={resumen} estaVacio={() => false}>
          {(r) => (
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard titulo="Ventas netas" valor={formatearMonto(r.ventasNetas)} />
              <StatCard titulo="Pedidos" valor={r.pedidos} />
              <StatCard titulo="Ticket promedio" valor={formatearMonto(r.ticketPromedio)} />
              <StatCard titulo="Unidades vendidas" valor={r.unidadesNetas} />
              <StatCard titulo="Envío cobrado" valor={formatearMonto(r.envioCobrado)} />
              <StatCard
                titulo="Carritos abandonados"
                valor={r.carritosAbandonados}
                ayuda="Con actividad en el periodo."
              />
            </dl>
          )}
        </ReportSection>
      </div>

      <div className="space-y-6">
        <div>
          <div className="mb-2 max-w-48">
            <Select
              label="Agrupar ventas"
              value={agrupacion}
              onChange={(e) => setAgrupacion(e.target.value)}
            >
              {AGRUPACIONES.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.etiqueta}
                </option>
              ))}
            </Select>
          </div>
          <ReportSection titulo="Ventas por periodo" consulta={ventas}>
            {(datos) => (
              <Suspense fallback={<CargandoGrafica />}>
                <SalesChart datos={datos} />
              </Suspense>
            )}
          </ReportSection>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <ReportSection titulo="Ventas por categoría" consulta={categorias}>
            {(datos) => (
              <Suspense fallback={<CargandoGrafica />}>
                <CategorySalesChart datos={datos} />
              </Suspense>
            )}
          </ReportSection>
          <ReportSection titulo="Productos más vendidos" consulta={top}>
            {(datos) => (
              <Suspense fallback={<CargandoGrafica />}>
                <TopProductsChart datos={datos} />
              </Suspense>
            )}
          </ReportSection>
        </div>

        <EstadoSistema />
      </div>
    </>
  );
}
