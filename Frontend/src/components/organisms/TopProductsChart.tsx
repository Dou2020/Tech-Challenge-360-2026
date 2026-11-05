import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COLOR_SERIE, cuadriculaGrafica, ejeGrafica, tooltipGrafica } from '../../config/graficas';
import type { ProductoVendido } from '../../types/reportes';
import { formatearMonto } from '../../utils/format';

/** Unidades netas de los productos más vendidos. Carga diferida (no está en el barrel). */
export function TopProductsChart({ datos }: { datos: ProductoVendido[] }) {
  const puntos = datos.map((d) => ({
    producto: d.producto,
    unidades: d.unidadesNetas,
    ventaNeta: d.ventaNeta,
  }));
  return (
    <div role="img" aria-label="Gráfica de productos más vendidos" className="h-72 w-full">
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
          <XAxis type="number" allowDecimals={false} {...ejeGrafica} />
          <YAxis type="category" dataKey="producto" width={130} {...ejeGrafica} />
          <Tooltip
            {...tooltipGrafica}
            formatter={(valor, _nombre, item) => [
              `${valor} u. · ${formatearMonto((item.payload as { ventaNeta: string }).ventaNeta)}`,
              'Vendidas',
            ]}
          />
          <Bar dataKey="unidades" fill={COLOR_SERIE} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
