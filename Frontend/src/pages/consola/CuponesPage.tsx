import { Link } from 'react-router';
import { Badge, Button, Money, Select } from '../../components/atoms';
import { PageHeading, SearchBox } from '../../components/molecules';
import { DataTable, type Columna } from '../../components/organisms';
import type { TonoBadge } from '../../config';
import { useCupones } from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import type { Cupon } from '../../types/administracion';
import { estadoDeCupon, type EstadoCupon } from '../../utils/cuponForm';
import { formatearFecha } from '../../utils/format';

const FILTROS = ['q', 'activo', 'vigente'] as const;
/** Igual que `q` en listarCuponesQuery (backend); un texto más largo daría 400. */
const MAX_BUSQUEDA = 100;

const TONOS: Record<EstadoCupon, TonoBadge> = {
  Vigente: 'verde',
  Próximo: 'azul',
  Vencido: 'rojo',
  Agotado: 'ambar',
  Inactivo: 'gris',
};

function valorDeCupon(c: Cupon) {
  return c.tipoDescuento === 'PORCENTAJE' ? `${Number(c.valor)} %` : <Money valor={c.valor} />;
}

const columnas: Columna<Cupon>[] = [
  {
    clave: 'codigo',
    titulo: 'Código',
    orden: 'codigo',
    celda: (c) => (
      <Link
        to={`/consola/cupones/${c.idCupon}`}
        className="font-mono font-medium text-acento hover:underline"
      >
        {c.codigo}
      </Link>
    ),
  },
  { clave: 'valor', titulo: 'Descuento', orden: 'valor', alinear: 'derecha', celda: valorDeCupon },
  { clave: 'categoria', titulo: 'Aplica a', celda: (c) => c.categoria ?? 'Todo el carrito' },
  {
    clave: 'inicio',
    titulo: 'Inicio',
    orden: 'fechaInicio',
    celda: (c) => <span className="text-texto-suave">{formatearFecha(c.fechaInicio)}</span>,
  },
  {
    clave: 'fin',
    titulo: 'Fin',
    orden: 'fechaFin',
    celda: (c) => <span className="text-texto-suave">{formatearFecha(c.fechaFin)}</span>,
  },
  {
    clave: 'usos',
    titulo: 'Usos',
    orden: 'usosActuales',
    alinear: 'derecha',
    celda: (c) => `${c.usosActuales} / ${c.limiteUsosTotal}`,
  },
  {
    clave: 'estado',
    titulo: 'Estado',
    celda: (c) => {
      const estado = estadoDeCupon(c);
      return <Badge tono={TONOS[estado]}>{estado}</Badge>;
    },
  },
];

/** Cupones (Administrador): lista con filtros y orden en la URL, y estado visible. */
export default function CuponesPage() {
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'codigo:asc',
    pageSizePorDefecto: 20,
  });
  const { filtros } = tabla;
  const cupones = useCupones(tabla.params);
  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');

  return (
    <>
      <PageHeading
        titulo="Cupones"
        descripcion="Un cupón por pedido, solo para clientes con sesión."
        accion={
          <Link
            to="/consola/cupones/nuevo"
            className="rounded-lg bg-primario px-4 py-2 text-sm font-medium text-sobre-primario hover:bg-primario-hover"
          >
            Nuevo cupón
          </Link>
        }
      />
      <div className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-sm font-medium text-texto-suave">Código</p>
          <SearchBox
            className="mt-1"
            etiqueta="Buscar cupón por código"
            valor={filtros.q}
            maxLength={MAX_BUSQUEDA}
            onBuscar={(q) => tabla.setFiltros({ q })}
          />
        </div>
        {/* "Activación" y "Fechas" filtran un solo dato cada uno; la columna Estado los combina con los usos. */}
        <Select
          label="Activación"
          value={filtros.activo}
          onChange={(e) => tabla.setFiltros({ activo: e.target.value })}
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </Select>
        <Select
          label="Fechas"
          ayuda="Solo compara la fecha de inicio y la de fin."
          value={filtros.vigente}
          onChange={(e) => tabla.setFiltros({ vigente: e.target.value })}
        >
          <option value="">Todas</option>
          <option value="true">Dentro de fechas</option>
          <option value="false">Fuera de fechas</option>
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
        titulo="Lista de cupones"
        columnas={columnas}
        consulta={cupones}
        tabla={tabla}
        idFila={(c) => c.idCupon}
        vacio={{
          titulo: hayFiltros ? 'No hay cupones con esos filtros' : 'Aún no hay cupones',
          descripcion: hayFiltros ? 'Prueba con otros filtros.' : 'Crea el primer cupón.',
          accion: hayFiltros ? (
            <Button onClick={tabla.limpiarFiltros}>Limpiar filtros</Button>
          ) : undefined,
        }}
      />
    </>
  );
}
