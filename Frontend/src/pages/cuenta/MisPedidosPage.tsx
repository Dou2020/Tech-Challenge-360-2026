import { Link } from 'react-router';
import { Input, Select, Money, Button } from '../../components/atoms';
import { OrderStatusBadge, PageHeading, SearchBox } from '../../components/molecules';
import { DataTable, type Columna } from '../../components/organisms';
import { estadosPedido } from '../../config';
import { usePedidos } from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import type { PedidoResumen } from '../../types/pedidos';
import { formatearFecha } from '../../utils/format';

const FILTROS = ['estado', 'desde', 'hasta', 'q'] as const;

const columnas: Columna<PedidoResumen>[] = [
  {
    clave: 'pedido',
    titulo: 'Pedido',
    celda: (p) => (
      <Link
        to={`/cuenta/pedidos/${p.idPedido}`}
        className="font-medium text-acento hover:underline"
      >
        {p.numeroPedido}
      </Link>
    ),
  },
  {
    clave: 'fecha',
    titulo: 'Fecha',
    orden: 'fechaCreacion',
    celda: (p) => <span className="text-texto-suave">{formatearFecha(p.fechaCreacion)}</span>,
  },
  { clave: 'estado', titulo: 'Estado', celda: (p) => <OrderStatusBadge estado={p.estado} /> },
  { clave: 'unidades', titulo: 'Unidades', alinear: 'derecha', celda: (p) => p.cantidadUnidades },
  {
    clave: 'total',
    titulo: 'Total',
    orden: 'total',
    alinear: 'derecha',
    celda: (p) => <Money valor={p.total} className="font-medium" />,
  },
];

const ORDENES = [
  { valor: 'fechaCreacion:desc', etiqueta: 'Más recientes' },
  { valor: 'fechaCreacion:asc', etiqueta: 'Más antiguos' },
  { valor: 'total:desc', etiqueta: 'Total: mayor a menor' },
  { valor: 'total:asc', etiqueta: 'Total: menor a mayor' },
];

export default function MisPedidosPage() {
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'fechaCreacion:desc',
    pageSizePorDefecto: 10,
  });
  const { filtros } = tabla;
  const rangoInvalido =
    filtros.desde !== '' && filtros.hasta !== '' && filtros.desde > filtros.hasta;
  // Con un rango invertido la API respondería 400: no se consulta hasta corregirlo.
  const pedidos = usePedidos(
    rangoInvalido ? { ...tabla.params, desde: undefined, hasta: undefined } : tabla.params,
  );
  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');

  return (
    <>
      <PageHeading titulo="Mis pedidos" descripcion="Historial de tus compras." />

      <div className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <p className="text-sm font-medium text-texto-suave">Número de pedido</p>
          <SearchBox
            className="mt-1"
            etiqueta="Buscar por número de pedido"
            placeholder="SC-2026-…"
            valor={filtros.q}
            onBuscar={(q) => tabla.setFiltros({ q })}
          />
        </div>
        <Select
          label="Estado"
          value={filtros.estado}
          onChange={(e) => tabla.setFiltros({ estado: e.target.value })}
        >
          <option value="">Todos</option>
          {Object.entries(estadosPedido).map(([codigo, { etiqueta }]) => (
            <option key={codigo} value={codigo}>
              {etiqueta}
            </option>
          ))}
        </Select>
        <Input
          label="Desde"
          type="date"
          value={filtros.desde}
          onChange={(e) => tabla.setFiltros({ desde: e.target.value })}
        />
        <Input
          label="Hasta"
          type="date"
          value={filtros.hasta}
          error={rangoInvalido ? 'Debe ser igual o posterior a la fecha inicial.' : undefined}
          onChange={(e) => tabla.setFiltros({ hasta: e.target.value })}
        />
        <div className="sm:col-span-2 lg:col-span-2">
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
        {hayFiltros && (
          <div className="flex items-end">
            <Button variante="ghost" onClick={tabla.limpiarFiltros}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      <DataTable
        titulo="Lista de pedidos"
        etiquetaCarga="Cargando pedidos"
        columnas={columnas}
        consulta={pedidos}
        tabla={tabla}
        idFila={(p) => p.idPedido}
        vacio={{
          titulo: hayFiltros ? 'No hay pedidos con esos filtros' : 'Aún no tienes pedidos',
          descripcion: hayFiltros
            ? 'Prueba con otros filtros.'
            : 'Cuando compres, tus pedidos aparecerán aquí.',
          accion: hayFiltros ? (
            <Button onClick={tabla.limpiarFiltros}>Limpiar filtros</Button>
          ) : (
            <Link to="/catalogo" className="text-sm font-medium text-acento hover:underline">
              Ver el catálogo
            </Link>
          ),
        }}
      />
    </>
  );
}
