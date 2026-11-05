import { Link } from 'react-router';
import { Button, Input, Money, Select } from '../../components/atoms';
import { OrderStatusBadge, PageHeading, SearchBox } from '../../components/molecules';
import { DataTable, type Columna } from '../../components/organisms';
import { estadosPedido } from '../../config';
import { useEstadosPedido, usePedidos } from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import type { PedidoResumen } from '../../types/pedidos';
import { formatearFecha } from '../../utils/format';

const FILTROS = ['estado', 'q', 'desde', 'hasta', 'idCliente'] as const;

const columnas: Columna<PedidoResumen>[] = [
  {
    clave: 'pedido',
    titulo: 'Pedido',
    celda: (p) => (
      <Link
        to={`/consola/pedidos/${p.idPedido}`}
        className="font-medium text-acento hover:underline"
      >
        {p.numeroPedido}
      </Link>
    ),
  },
  {
    clave: 'cliente',
    titulo: 'Cliente',
    celda: (p) => (
      <>
        {p.cliente}
        <span className="block text-xs text-texto-tenue">{p.correoCliente}</span>
      </>
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

/** Gestión de pedidos (Operador y Administrador): todos los pedidos con filtros y orden en la URL. */
export default function PedidosPage() {
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'fechaCreacion:desc',
    pageSizePorDefecto: 20,
  });
  const { filtros } = tabla;
  const estados = useEstadosPedido();
  const rangoInvalido =
    filtros.desde !== '' && filtros.hasta !== '' && filtros.desde > filtros.hasta;
  // Con un rango invertido la API respondería 400: no se consulta hasta corregirlo.
  const pedidos = usePedidos(
    rangoInvalido ? { ...tabla.params, desde: undefined, hasta: undefined } : tabla.params,
  );
  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');
  const opcionesEstado =
    estados.data?.estados.map((e) => ({ codigo: e.codigo, nombre: e.nombre })) ??
    Object.entries(estadosPedido).map(([codigo, { etiqueta }]) => ({ codigo, nombre: etiqueta }));

  return (
    <>
      <PageHeading
        titulo="Pedidos"
        descripcion="Todos los pedidos de la tienda. Abre uno para avanzar su estado, cancelarlo o registrar una devolución."
      />

      <div className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
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
          {opcionesEstado.map((e) => (
            <option key={e.codigo} value={e.codigo}>
              {e.nombre}
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
        <Input
          label="ID de cliente"
          type="number"
          min={1}
          inputMode="numeric"
          value={filtros.idCliente}
          onChange={(e) => tabla.setFiltros({ idCliente: e.target.value })}
        />
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
        columnas={columnas}
        consulta={pedidos}
        tabla={tabla}
        idFila={(p) => p.idPedido}
        vacio={{
          titulo: hayFiltros ? 'No hay pedidos con esos filtros' : 'Aún no hay pedidos',
          descripcion: hayFiltros ? 'Prueba con otros filtros.' : 'Los pedidos aparecerán aquí.',
          accion: hayFiltros ? (
            <Button onClick={tabla.limpiarFiltros}>Limpiar filtros</Button>
          ) : undefined,
        }}
      />
    </>
  );
}
