import { LayoutGrid, List } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, InlineAlert, Input, Money, Select, Skeleton } from '../../components/atoms';
import {
  ConfirmationDialog,
  Notice,
  OrderStatusBadge,
  PageHeading,
  SearchBox,
} from '../../components/molecules';
import { DataTable, type Columna } from '../../components/organisms';
import { colaOperacion, columnasTablero, estadosPedido } from '../../config';
import {
  useEstadosPedido,
  usePedidos,
  useTableroPedidos,
  useTransicionarPedido,
} from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import type { DestinoPedido, PedidoResumen } from '../../types/pedidos';
import { formatearFecha } from '../../utils/format';
import { avisoErrorTransicion, avisoExito, type Aviso } from '../../utils/notice';
import { destinosPermitidos } from '../../utils/pedidos';

// OrdersBoard (@dnd-kit) no sale del barrel de organismos y se carga aparte, para que no entre al
// bundle inicial ni a la vista de lista.
const OrdersBoard = lazy(() =>
  import('../../components/organisms/OrdersBoard').then((m) => ({ default: m.OrdersBoard })),
);

const FILTROS = ['estado', 'q', 'desde', 'hasta', 'idCliente'] as const;
/** Filtros que aplican a todas las columnas del tablero (el estado lo da cada columna). */
const FILTROS_TABLERO = ['q', 'desde', 'hasta', 'idCliente'] as const;
const MAX_TEXTO = 300;

type Tabla = ReturnType<typeof useServerTable<(typeof FILTROS)[number]>>;

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

interface ListaProps {
  tabla: Tabla;
  params: Record<string, string | number | undefined>;
  hayFiltros: boolean;
}

function ListaPedidos({ tabla, params, hayFiltros }: ListaProps) {
  const pedidos = usePedidos(params);
  return (
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
  );
}

function CargandoTablero() {
  return (
    <div role="status" aria-label="Cargando tablero" className="flex gap-4 overflow-hidden">
      {columnasTablero.map((c) => (
        <Skeleton key={c.estado} className="h-80 w-72 shrink-0" />
      ))}
    </div>
  );
}

/** Tablero: arrastrar una tarjeta pide confirmación y ejecuta el cambio por el endpoint de su `via`. */
function TableroPedidos({ filtros }: { filtros: Record<string, string | undefined> }) {
  const consultas = useTableroPedidos(columnasTablero, filtros);
  const estados = useEstadosPedido();
  const transicionar = useTransicionarPedido();
  const [movimiento, setMovimiento] = useState<{
    pedido: PedidoResumen;
    destino: DestinoPedido;
  } | null>(null);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const verTodos = (estado: string) => {
    const query = new URLSearchParams({ estado });
    for (const [clave, valor] of Object.entries(filtros)) if (valor) query.set(clave, valor);
    return `/consola/pedidos?${query.toString()}`;
  };

  function cerrar() {
    setMovimiento(null);
    setTexto('');
  }

  function confirmar() {
    if (!movimiento) return;
    const { pedido, destino } = movimiento;
    transicionar.mutate(
      {
        idPedido: pedido.idPedido,
        estado: destino.estado,
        via: destino.via,
        texto: texto.trim() || undefined,
      },
      {
        onSuccess: () =>
          setAviso(
            avisoExito(
              destino.via === 'CANCELAR'
                ? `Pedido ${pedido.numeroPedido} cancelado. La existencia y el cupón se reintegraron.`
                : `El pedido ${pedido.numeroPedido} pasó a "${destino.nombre}".`,
            ),
          ),
        onError: (error) => setAviso(avisoErrorTransicion(error)),
        onSettled: cerrar,
      },
    );
  }

  const esCancelar = movimiento?.destino.via === 'CANCELAR';

  return (
    <>
      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}
      {estados.isError && (
        <div className="mb-4">
          <InlineAlert>
            No se pudieron cargar los cambios de estado permitidos: por ahora el tablero es solo de
            lectura.
          </InlineAlert>
        </div>
      )}

      <Suspense fallback={<CargandoTablero />}>
        <OrdersBoard
          columnas={columnasTablero.map((c, i) => ({
            estado: c.estado,
            consulta: consultas[i]!,
            verTodos: verTodos(c.estado),
          }))}
          destinos={(origen) => destinosPermitidos(estados.data, origen)}
          bloqueado={transicionar.isPending}
          onMover={(pedido, destino) => setMovimiento({ pedido, destino })}
        />
      </Suspense>

      <ConfirmationDialog
        abierto={movimiento !== null}
        titulo={
          esCancelar
            ? `¿Cancelar el pedido ${movimiento?.pedido.numeroPedido ?? ''}?`
            : `¿Pasar el pedido ${movimiento?.pedido.numeroPedido ?? ''} a "${movimiento?.destino.nombre ?? ''}"?`
        }
        descripcion={
          esCancelar
            ? 'Se devolverá la existencia y se liberará el cupón. No se puede deshacer.'
            : 'El cambio queda en el historial del pedido.'
        }
        textoConfirmar={esCancelar ? 'Cancelar pedido' : 'Confirmar cambio'}
        textoCancelar={esCancelar ? 'Mantener pedido' : 'Cancelar'}
        cargando={transicionar.isPending}
        onConfirmar={confirmar}
        onCancelar={cerrar}
      >
        <Input
          label={esCancelar ? 'Motivo (opcional)' : 'Comentario (opcional)'}
          value={texto}
          maxLength={MAX_TEXTO}
          onChange={(e) => setTexto(e.target.value)}
        />
      </ConfirmationDialog>
    </>
  );
}

/**
 * Gestión de pedidos (Operador y Administrador): todos los pedidos como lista (filtros y orden en la
 * URL) o como tablero por estado (`?vista=tablero`), donde se arrastran para cambiar su estado.
 */
export default function PedidosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const esTablero = searchParams.get('vista') === 'tablero';
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
  const params = rangoInvalido
    ? { ...tabla.params, desde: undefined, hasta: undefined }
    : tabla.params;
  const filtrosVisibles = esTablero ? FILTROS_TABLERO : FILTROS;
  const hayFiltros = filtrosVisibles.some((f) => filtros[f] !== '');
  const opcionesEstado =
    estados.data?.estados.map((e) => ({ codigo: e.codigo, nombre: e.nombre })) ??
    Object.entries(estadosPedido).map(([codigo, { etiqueta }]) => ({ codigo, nombre: etiqueta }));

  /** El tablero ya separa por estado y no pagina: al entrar se quitan esos parámetros. */
  function cambiarVista(tablero: boolean) {
    setSearchParams((previos) => {
      const siguientes = new URLSearchParams(previos);
      if (tablero) {
        siguientes.set('vista', 'tablero');
        siguientes.delete('estado');
        siguientes.delete('page');
      } else siguientes.delete('vista');
      return siguientes;
    });
  }

  const filtrosTablero = Object.fromEntries(
    FILTROS_TABLERO.map((f) => [
      f,
      filtros[f] === '' || (rangoInvalido && (f === 'desde' || f === 'hasta'))
        ? undefined
        : filtros[f],
    ]),
  );

  return (
    <>
      <PageHeading
        titulo="Pedidos"
        descripcion={
          esTablero
            ? 'Arrastra un pedido a otra columna para cambiar su estado. Las devoluciones se registran en el detalle del pedido.'
            : 'Todos los pedidos de la tienda. Abre uno para avanzar su estado, cancelarlo o registrar una devolución.'
        }
        accion={
          <div role="group" aria-label="Vista" className="flex gap-1">
            <Button
              variante={esTablero ? 'secondary' : 'primary'}
              aria-pressed={!esTablero}
              className="min-h-9 px-3 py-1.5 text-sm"
              onClick={() => cambiarVista(false)}
            >
              <List aria-hidden className="size-4" />
              Lista
            </Button>
            <Button
              variante={esTablero ? 'primary' : 'secondary'}
              aria-pressed={esTablero}
              className="min-h-9 px-3 py-1.5 text-sm"
              onClick={() => cambiarVista(true)}
            >
              <LayoutGrid aria-hidden className="size-4" />
              Tablero
            </Button>
          </div>
        }
      />

      {!esTablero && (
        <div role="group" aria-label="Filtros rápidos" className="mb-3 flex flex-wrap gap-2">
          {[{ estado: '', etiqueta: 'Todos' }, ...colaOperacion].map(({ estado, etiqueta }) => {
            const activo = filtros.estado === estado;
            return (
              <Button
                key={etiqueta}
                variante={activo ? 'primary' : 'secondary'}
                aria-pressed={activo}
                className="min-h-8 rounded-full px-3 py-1 text-xs"
                onClick={() => tabla.setFiltros({ estado })}
              >
                {etiqueta}
              </Button>
            );
          })}
        </div>
      )}

      <div
        className={`tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 ${esTablero ? 'lg:grid-cols-5' : 'lg:grid-cols-6'}`}
      >
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
        {!esTablero && (
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
        )}
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

      {esTablero ? (
        <TableroPedidos filtros={filtrosTablero} />
      ) : (
        <ListaPedidos tabla={tabla} params={params} hayFiltros={hayFiltros} />
      )}
    </>
  );
}
