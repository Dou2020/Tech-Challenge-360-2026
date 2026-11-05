import { Link } from 'react-router';
import { Badge, Money, Select } from '../../components/atoms';
import { DateRangeFilter, PageHeading, ReportSection } from '../../components/molecules';
import { DataTable, ReportTable, type Columna } from '../../components/organisms';
import {
  useCarritosAbandonados,
  useProductosMasVendidos,
  useVentasPorCategoria,
  useVentasPorPeriodo,
} from '../../hooks/queries';
import { AGRUPACIONES, useAgrupacion } from '../../hooks/useAgrupacion';
import { useRangoFechas } from '../../hooks/useRangoFechas';
import { useServerTable } from '../../hooks/useServerTable';
import type {
  CarritoAbandonado,
  ProductoVendido,
  VentaCategoria,
  VentaPeriodo,
} from '../../types/reportes';
import { formatearFecha } from '../../utils/format';
import { formatearDia } from '../../utils/rangoFechas';

const columnasVentas: Columna<VentaPeriodo>[] = [
  { clave: 'periodo', titulo: 'Periodo (inicio)', celda: (v) => formatearDia(v.periodoInicio) },
  { clave: 'pedidos', titulo: 'Pedidos', alinear: 'derecha', celda: (v) => v.pedidos },
  { clave: 'unidades', titulo: 'Unidades', alinear: 'derecha', celda: (v) => v.unidadesNetas },
  {
    clave: 'ventas',
    titulo: 'Ventas netas',
    alinear: 'derecha',
    celda: (v) => <Money valor={v.ventas} />,
  },
];

const columnasCategorias: Columna<VentaCategoria>[] = [
  { clave: 'categoria', titulo: 'Categoría', celda: (c) => c.categoria },
  { clave: 'vendidas', titulo: 'Vendidas', alinear: 'derecha', celda: (c) => c.unidadesVendidas },
  {
    clave: 'devueltas',
    titulo: 'Devueltas',
    alinear: 'derecha',
    celda: (c) => c.unidadesDevueltas,
  },
  { clave: 'netas', titulo: 'Netas', alinear: 'derecha', celda: (c) => c.unidadesNetas },
  {
    clave: 'bruta',
    titulo: 'Venta bruta',
    alinear: 'derecha',
    celda: (c) => <Money valor={c.ventaBruta} />,
  },
  {
    clave: 'reembolsado',
    titulo: 'Reembolsado',
    alinear: 'derecha',
    celda: (c) => <Money valor={c.montoReembolsado} />,
  },
  {
    clave: 'neta',
    titulo: 'Venta neta',
    alinear: 'derecha',
    celda: (c) => <Money valor={c.ventaNeta} className="font-medium" />,
  },
];

const columnasTop: Columna<ProductoVendido>[] = [
  { clave: 'producto', titulo: 'Producto', celda: (p) => p.producto },
  { clave: 'categoria', titulo: 'Categoría', celda: (p) => p.categoria },
  {
    clave: 'unidades',
    titulo: 'Unidades netas',
    alinear: 'derecha',
    celda: (p) => p.unidadesNetas,
  },
  {
    clave: 'neta',
    titulo: 'Venta neta',
    alinear: 'derecha',
    celda: (p) => <Money valor={p.ventaNeta} className="font-medium" />,
  },
];

const columnasCarritos: Columna<CarritoAbandonado>[] = [
  {
    clave: 'cliente',
    titulo: 'Cliente',
    orden: 'cliente',
    celda: (c) =>
      c.tipo === 'INVITADO' ? (
        <Badge>Invitado</Badge>
      ) : (
        <>
          {c.cliente}
          <span className="block text-xs text-texto-tenue">{c.correo}</span>
        </>
      ),
  },
  {
    clave: 'unidades',
    titulo: 'Unidades',
    orden: 'unidades',
    alinear: 'derecha',
    celda: (c) => c.cantidadUnidades,
  },
  {
    clave: 'valor',
    titulo: 'Valor',
    orden: 'valor',
    alinear: 'derecha',
    celda: (c) => <Money valor={c.valor} className="font-medium" />,
  },
  {
    clave: 'fecha',
    titulo: 'Última actividad',
    orden: 'fecha',
    celda: (c) => (
      <span className="text-texto-suave">
        {formatearFecha(c.fechaUltimaActividad)} · {c.horasInactivo} h
      </span>
    ),
  },
];

/** Reportes en tablas con el mismo rango de fechas que el dashboard. */
export default function ReportesPage() {
  const rango = useRangoFechas();
  const consulta = { desde: rango.desde, hasta: rango.hasta };
  const { agrupacion, setAgrupacion } = useAgrupacion();
  const ventas = useVentasPorPeriodo(consulta, agrupacion, rango.valido);
  const tituloVentas = `Ventas por ${AGRUPACIONES.find((a) => a.valor === agrupacion)?.etiqueta.slice(4) ?? 'día'}`;
  const categorias = useVentasPorCategoria(consulta, rango.valido);
  const top = useProductosMasVendidos(consulta, 10, rango.valido);

  const tablaCarritos = useServerTable({
    filtros: [] as const,
    sortPorDefecto: 'fecha:asc',
    pageSizePorDefecto: 10,
  });
  const carritos = useCarritosAbandonados({ ...tablaCarritos.params, ...consulta }, rango.valido);

  return (
    <>
      <PageHeading
        titulo="Reportes"
        descripcion="Pedidos completados (entregados y con devolución parcial), sin envío y descontando devoluciones."
      />
      <DateRangeFilter
        desde={rango.desde}
        hasta={rango.hasta}
        valido={rango.valido}
        esPorDefecto={rango.esPorDefecto}
        onCambiar={rango.setRango}
        onRestablecer={rango.restablecer}
      />

      <div className="space-y-6">
        <div className="max-w-48">
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

        <ReportSection titulo={tituloVentas} consulta={ventas}>
          {(filas) => (
            <ReportTable
              titulo={tituloVentas}
              columnas={columnasVentas}
              filas={filas}
              idFila={(v) => v.periodoInicio}
            />
          )}
        </ReportSection>

        <ReportSection titulo="Ventas por categoría" consulta={categorias}>
          {(filas) => (
            <ReportTable
              titulo="Ventas por categoría"
              columnas={columnasCategorias}
              filas={filas}
              idFila={(c) => c.idCategoria}
            />
          )}
        </ReportSection>

        <ReportSection titulo="Productos más vendidos" consulta={top}>
          {(filas) => (
            <ReportTable
              titulo="Productos más vendidos"
              columnas={columnasTop}
              filas={filas}
              idFila={(p) => p.idProducto}
            />
          )}
        </ReportSection>

        <section aria-labelledby="titulo-carritos">
          <h2 id="titulo-carritos" className="mb-3 font-semibold tracking-tight text-texto">
            Carritos abandonados
          </h2>
          {rango.valido ? (
            <DataTable
              titulo="Carritos abandonados"
              columnas={columnasCarritos}
              consulta={carritos}
              tabla={tablaCarritos}
              idFila={(c) => c.idCarrito}
              vacio={{
                titulo: 'Sin carritos abandonados',
                descripcion: 'No hay carritos con actividad en ese periodo.',
              }}
            />
          ) : (
            <p className="text-sm text-texto-suave">
              Corrige el rango de fechas para ver este reporte.
            </p>
          )}
          <p className="mt-2 text-xs text-texto-tenue">
            Un carrito cuenta como abandonado tras varias horas sin actividad.{' '}
            <Link to="/consola" className="text-acento hover:underline">
              Volver al dashboard
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
