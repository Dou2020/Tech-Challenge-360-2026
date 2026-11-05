import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  COLOR_SERIE,
  COLOR_SERIE_SECUNDARIA,
  cuadriculaGrafica,
  ejeGrafica,
  tooltipGrafica,
} from '../../config/graficas';
import type { VentaPeriodo } from '../../types/reportes';
import { formatearMonto } from '../../utils/format';
import { formatearDia } from '../../utils/rangoFechas';

/**
 * Ventas netas (barras, eje izquierdo) y número de pedidos (línea, eje derecho) por periodo. Se carga con import dinámico (no está en el barrel) para que
 * recharts no entre en el bundle inicial. Los montos se convierten a número solo para el eje.
 */
export function SalesChart({ datos }: { datos: VentaPeriodo[] }) {
  const puntos = datos.map((d) => ({
    periodo: formatearDia(d.periodoInicio),
    ventas: Number(d.ventas),
    pedidos: d.pedidos,
  }));
  return (
    <div role="img" aria-label="Gráfica de ventas netas por periodo" className="h-72 w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 600, height: 288 }}
      >
        <ComposedChart data={puntos} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid {...cuadriculaGrafica} vertical={false} />
          <XAxis dataKey="periodo" {...ejeGrafica} />
          <YAxis
            yAxisId="ventas"
            {...ejeGrafica}
            width={64}
            tickFormatter={(v: number) => `Q ${v}`}
          />
          <YAxis
            yAxisId="pedidos"
            orientation="right"
            allowDecimals={false}
            {...ejeGrafica}
            width={40}
          />
          <Tooltip
            {...tooltipGrafica}
            formatter={(valor, nombre) =>
              nombre === 'ventas'
                ? [formatearMonto(Number(valor)), 'Ventas netas']
                : [valor, 'Pedidos']
            }
          />
          <Bar
            yAxisId="ventas"
            dataKey="ventas"
            name="ventas"
            fill={COLOR_SERIE}
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="pedidos"
            dataKey="pedidos"
            name="pedidos"
            stroke={COLOR_SERIE_SECUNDARIA}
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--superficie)', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
