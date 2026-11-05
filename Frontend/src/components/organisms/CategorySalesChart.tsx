import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COLOR_SERIE, cuadriculaGrafica, ejeGrafica, tooltipGrafica } from '../../config/graficas';
import type { VentaCategoria } from '../../types/reportes';
import { formatearMonto } from '../../utils/format';

/** Venta neta por categoría. Carga diferida (no está en el barrel). */
export function CategorySalesChart({ datos }: { datos: VentaCategoria[] }) {
  const puntos = datos.map((d) => ({ categoria: d.categoria, ventaNeta: Number(d.ventaNeta) }));
  return (
    <div role="img" aria-label="Gráfica de venta neta por categoría" className="h-72 w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 600, height: 288 }}
      >
        <BarChart
          data={puntos}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid {...cuadriculaGrafica} horizontal={false} />
          <XAxis type="number" {...ejeGrafica} tickFormatter={(v: number) => `Q ${v}`} />
          <YAxis type="category" dataKey="categoria" width={110} {...ejeGrafica} />
          <Tooltip
            {...tooltipGrafica}
            formatter={(valor) => [formatearMonto(Number(valor)), 'Venta neta']}
          />
          <Bar dataKey="ventaNeta" fill={COLOR_SERIE} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
