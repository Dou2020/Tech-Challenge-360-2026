import { Link } from 'react-router';
import { useKardex, useTiposMovimiento } from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import type { Movimiento } from '../../types/inventario';
import { formatearFecha } from '../../utils/format';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';
import { DataTable, type Columna } from './DataTable';

const FILTROS = ['desde', 'hasta', 'tipo'] as const;

const columnas: Columna<Movimiento>[] = [
  {
    clave: 'fecha',
    titulo: 'Fecha',
    orden: 'fecha',
    celda: (m) => <span className="text-texto-suave">{formatearFecha(m.fecha)}</span>,
  },
  { clave: 'tipo', titulo: 'Tipo', celda: (m) => m.nombreTipoMovimiento },
  {
    clave: 'cantidad',
    titulo: 'Cantidad',
    alinear: 'derecha',
    celda: (m) => (
      <span className={m.signo > 0 ? 'text-exito-texto' : 'text-peligro-texto'}>
        {m.signo > 0 ? '+' : '−'}
        {m.cantidad}
      </span>
    ),
  },
  { clave: 'anterior', titulo: 'Antes', alinear: 'derecha', celda: (m) => m.existenciaAnterior },
  { clave: 'nueva', titulo: 'Después', alinear: 'derecha', celda: (m) => m.existenciaNueva },
  {
    clave: 'motivo',
    titulo: 'Motivo',
    celda: (m) => (
      <>
        {m.motivo}
        {m.idPedido !== null && m.numeroPedido && (
          <>
            {' · '}
            <Link
              to={`/consola/pedidos/${m.idPedido}`}
              className="font-medium text-acento hover:underline"
            >
              {m.numeroPedido}
            </Link>
          </>
        )}
      </>
    ),
  },
  { clave: 'usuario', titulo: 'Usuario', celda: (m) => m.usuario },
];

/** Kardex de una variante: filtros (desde, hasta, tipo), orden y página viven en la URL. */
export function KardexTable({ idVariante }: { idVariante: number }) {
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'fecha:desc',
    pageSizePorDefecto: 20,
  });
  const { filtros } = tabla;
  const tipos = useTiposMovimiento();
  const rangoInvalido =
    filtros.desde !== '' && filtros.hasta !== '' && filtros.desde > filtros.hasta;
  // Con un rango invertido la API respondería 400: no se consulta hasta corregirlo.
  const kardex = useKardex(
    idVariante,
    rangoInvalido ? { ...tabla.params, desde: undefined, hasta: undefined } : tabla.params,
  );
  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');

  return (
    <div>
      <div className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <Select
          label="Tipo de movimiento"
          value={filtros.tipo}
          onChange={(e) => tabla.setFiltros({ tipo: e.target.value })}
        >
          <option value="">Todos</option>
          {tipos.data?.map((t) => (
            <option key={t.codigo} value={t.codigo}>
              {t.nombre}
            </option>
          ))}
        </Select>
        {hayFiltros && (
          <div className="flex items-end">
            <Button variante="ghost" onClick={tabla.limpiarFiltros}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>
      <DataTable
        titulo="Movimientos de inventario"
        columnas={columnas}
        consulta={kardex}
        tabla={tabla}
        idFila={(m) => m.idMovimientoInventario}
        vacio={{
          titulo: hayFiltros ? 'No hay movimientos con esos filtros' : 'Sin movimientos',
          descripcion: hayFiltros
            ? 'Prueba con otros filtros.'
            : 'Esta variante aún no tiene kardex.',
        }}
      />
    </div>
  );
}
