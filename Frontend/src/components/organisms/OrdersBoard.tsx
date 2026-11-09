import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import type { UseQueryResult } from '@tanstack/react-query';
import { GripVertical } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { infoEstadoPedido } from '../../config/orderStatus';
import type { Page } from '../../types/api';
import type { DestinoPedido, PedidoResumen } from '../../types/pedidos';
import { formatearFecha } from '../../utils/format';
import { Money } from '../atoms/Money';
import { Skeleton } from '../atoms/Skeleton';
import { ErrorState } from '../molecules/ErrorState';
import { OrderStatusBadge } from '../molecules/OrderStatusBadge';

export interface ColumnaTablero {
  estado: string;
  consulta: Pick<
    UseQueryResult<Page<PedidoResumen>>,
    'data' | 'isPending' | 'isError' | 'error' | 'refetch'
  >;
  /** Lista completa de ese estado (la columna muestra solo la primera página). */
  verTodos: string;
}

interface Props {
  columnas: ColumnaTablero[];
  /** Estados a los que el rol de quien consulta puede mover un pedido que está en `estadoOrigen`. */
  destinos: (estadoOrigen: string) => DestinoPedido[];
  /** Mientras se guarda un cambio no se puede arrastrar. */
  bloqueado?: boolean;
  /** Se pide mover el pedido; quien llama confirma y ejecuta. */
  onMover: (pedido: PedidoResumen, destino: DestinoPedido) => void;
}

const instrucciones: ScreenReaderInstructions = {
  draggable:
    'Para mover el pedido, presiona espacio o Enter, usa las flechas izquierda y derecha para elegir la columna y presiona espacio o Enter para soltarlo. Escape cancela.',
};

/** Con puntero gana la columna bajo el cursor; con teclado (sin puntero), la que toca la tarjeta. */
const deteccion: CollisionDetection = (args) => {
  const bajoPuntero = pointerWithin(args);
  return bajoPuntero.length > 0 ? bajoPuntero : rectIntersection(args);
};

/** Las flechas izquierda y derecha saltan a la columna vecina, conservando la altura. */
const coordenadasTeclado: KeyboardCoordinateGetter = (evento, { context, currentCoordinates }) => {
  const paso = evento.code === 'ArrowRight' ? 1 : evento.code === 'ArrowLeft' ? -1 : 0;
  if (paso === 0) return undefined;
  evento.preventDefault();
  const columnas = [...context.droppableRects.values()].sort((a, b) => a.left - b.left);
  let actual = 0;
  columnas.forEach((r, i) => {
    if (r.left <= currentCoordinates.x + 1) actual = i;
  });
  const origen = columnas[actual];
  const destino = columnas[actual + paso];
  if (!origen || !destino) return undefined;
  return { x: destino.left + (currentCoordinates.x - origen.left), y: currentCoordinates.y };
};

const etiqueta = (estado: string) => infoEstadoPedido(estado).etiqueta;
const pedidoDe = (datos: unknown) => (datos as { pedido?: PedidoResumen } | undefined)?.pedido;

/**
 * Contenido de una tarjeta. Sin `asa` es la copia que sigue al puntero: el número va sin enlace para
 * no duplicarlo mientras se arrastra.
 */
function ContenidoTarjeta({ pedido, asa }: { pedido: PedidoResumen; asa?: ReactNode }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        {asa === undefined ? (
          <span className="text-sm font-medium text-acento">{pedido.numeroPedido}</span>
        ) : (
          <Link
            to={`/consola/pedidos/${pedido.idPedido}`}
            className="text-sm font-medium text-acento hover:underline"
          >
            {pedido.numeroPedido}
          </Link>
        )}
        {asa}
      </div>
      <p className="mt-1 truncate text-sm text-texto" title={pedido.correoCliente}>
        {pedido.cliente}
      </p>
      <p className="text-xs text-texto-tenue">{formatearFecha(pedido.fechaCreacion)}</p>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-texto-suave">
          {pedido.cantidadUnidades} {pedido.cantidadUnidades === 1 ? 'unidad' : 'unidades'}
        </span>
        <Money valor={pedido.total} className="font-medium" />
      </div>
    </>
  );
}

interface TarjetaProps {
  pedido: PedidoResumen;
  destinos: DestinoPedido[];
  bloqueado: boolean;
  onMover: (destino: DestinoPedido) => void;
}

/** Un pedido arrastrable. El selector "Mover a" es la alternativa sin arrastre (y en móvil). */
function TarjetaPedido({ pedido, destinos, bloqueado, onMover }: TarjetaProps) {
  const fijo = bloqueado || destinos.length === 0;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `pedido-${pedido.idPedido}`,
    data: { pedido },
    disabled: fijo,
  });
  return (
    <li
      ref={setNodeRef}
      data-tarjeta-pedido
      className={`tarjeta p-3 ${isDragging ? 'opacity-40' : ''}`}
    >
      <ContenidoTarjeta
        pedido={pedido}
        asa={
          destinos.length > 0 ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              disabled={bloqueado}
              aria-label={`Mover pedido ${pedido.numeroPedido}`}
              style={{ touchAction: 'none' }}
              className="-m-1 cursor-grab rounded p-1 text-texto-suave hover:bg-superficie-suave disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
          ) : null
        }
      />
      {destinos.length > 0 && (
        <select
          aria-label={`Mover ${pedido.numeroPedido} a`}
          value=""
          disabled={bloqueado}
          onChange={(e) => {
            const destino = destinos.find((d) => d.estado === e.target.value);
            if (destino) onMover(destino);
          }}
          className="mt-2 block w-full rounded-lg border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-texto-suave outline-none focus:border-primario focus:ring-3 focus:ring-primario/20 disabled:text-texto-tenue"
        >
          <option value="">Mover a…</option>
          {destinos.map((d) => (
            <option key={d.estado} value={d.estado}>
              {d.nombre}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}

interface ColumnaProps {
  columna: ColumnaTablero;
  indice: number;
  /** Mientras se arrastra: si la columna acepta el pedido (null sin arrastre y en su columna). */
  acepta: boolean | null;
  destinos: Props['destinos'];
  bloqueado: boolean;
  onMover: Props['onMover'];
}

function Columna({ columna, indice, acepta, destinos, bloqueado, onMover }: ColumnaProps) {
  const idTitulo = useId();
  const { estado, consulta, verTodos } = columna;
  const { setNodeRef, isOver } = useDroppable({ id: estado });
  const nombre = etiqueta(estado);
  const datos = consulta.data;

  const resalte =
    acepta === null
      ? 'border-borde'
      : acepta
        ? isOver
          ? 'border-primario bg-primario/10'
          : 'border-primario/60 border-dashed'
        : 'border-borde opacity-50';

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={idTitulo}
      data-columna={indice}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-superficie-suave/60 p-3 transition-colors ${resalte}`}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 id={idTitulo} className="flex items-center gap-2">
          <OrderStatusBadge estado={estado} />
          <span className="sr-only">
            {datos ? `, ${datos.total} ${datos.total === 1 ? 'pedido' : 'pedidos'}` : ', cargando'}
          </span>
        </h2>
        <span aria-hidden className="text-sm font-semibold text-texto-suave tabular-nums">
          {datos ? datos.total : '…'}
        </span>
      </header>

      {consulta.isError && !datos ? (
        <ErrorState error={consulta.error} onReintentar={() => void consulta.refetch()} />
      ) : consulta.isPending ? (
        <div role="status" aria-label={`Cargando ${nombre}`} className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : datos && datos.items.length > 0 ? (
        <>
          <ul className="space-y-2">
            {datos.items.map((p) => (
              <TarjetaPedido
                key={p.idPedido}
                pedido={p}
                destinos={destinos(p.estado)}
                bloqueado={bloqueado}
                onMover={(d) => onMover(p, d)}
              />
            ))}
          </ul>
          {datos.total > datos.items.length && (
            <p className="mt-3 text-center text-xs text-texto-suave">
              Mostrando {datos.items.length} de {datos.total} ·{' '}
              <Link
                to={verTodos}
                aria-label={`Ver todos los pedidos en ${nombre}`}
                className="font-medium text-acento hover:underline"
              >
                Ver todos
              </Link>
            </p>
          )}
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-borde px-3 py-6 text-center text-sm text-texto-tenue">
          Sin pedidos
        </p>
      )}
    </section>
  );
}

/**
 * Tablero de pedidos: una columna por estado. Arrastrar una tarjeta (con puntero o teclado) a otra
 * columna pide el cambio con `onMover`; solo se aceptan los destinos que `destinos` permite.
 * Presentacional: no llama a la API.
 */
export function OrdersBoard({ columnas, destinos, bloqueado = false, onMover }: Props) {
  const [activo, setActivo] = useState<PedidoResumen | null>(null);
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: coordenadasTeclado }),
  );
  const destinosActivos = activo ? destinos(activo.estado) : [];
  const destinoEn = (pedido: PedidoResumen | undefined, estado: unknown) =>
    pedido ? destinos(pedido.estado).find((d) => d.estado === estado) : undefined;

  function alLevantar({ active }: DragStartEvent) {
    setActivo(pedidoDe(active.data.current) ?? null);
  }

  function alSoltar({ active, over }: DragEndEvent) {
    setActivo(null);
    const pedido = pedidoDe(active.data.current);
    const destino = destinoEn(pedido, over?.id);
    if (pedido && destino) onMover(pedido, destino);
  }

  const numero = (datos: unknown) => pedidoDe(datos)?.numeroPedido ?? '';
  // Al levantar, la tarjeta ya está sobre su columna: ese anuncio también repite los destinos.
  const posibles = (pedido: PedidoResumen | undefined) =>
    `Puede pasar a: ${(pedido ? destinos(pedido.estado) : []).map((d) => d.nombre).join(', ')}.`;
  const anuncios: Announcements = {
    onDragStart: ({ active }) =>
      `Pedido ${numero(active.data.current)} levantado. ${posibles(pedidoDe(active.data.current))}`,
    onDragOver: ({ active, over }) => {
      if (!over) return undefined;
      const pedido = pedidoDe(active.data.current);
      if (pedido?.estado === over.id)
        return `Pedido ${pedido.numeroPedido} en su columna actual. ${posibles(pedido)}`;
      return destinoEn(pedido, over.id)
        ? `Pedido ${numero(active.data.current)} sobre ${etiqueta(String(over.id))}.`
        : `Pedido ${numero(active.data.current)} sobre ${etiqueta(String(over.id))}: no puede pasar a ese estado.`;
    },
    onDragEnd: ({ active, over }) => {
      const destino = destinoEn(pedidoDe(active.data.current), over?.id);
      return destino
        ? `Pedido ${numero(active.data.current)} soltado en ${destino.nombre}. Confirma el cambio.`
        : `Pedido ${numero(active.data.current)} soltado sin cambios.`;
    },
    onDragCancel: ({ active }) =>
      `Movimiento cancelado. El pedido ${numero(active.data.current)} no cambió.`,
  };

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={deteccion}
      onDragStart={alLevantar}
      onDragEnd={alSoltar}
      onDragCancel={() => setActivo(null)}
      accessibility={{ announcements: anuncios, screenReaderInstructions: instrucciones }}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="flex min-w-max items-start gap-4">
          {columnas.map((c, i) => (
            <Columna
              key={c.estado}
              columna={c}
              indice={i}
              acepta={
                activo && activo.estado !== c.estado
                  ? destinosActivos.some((d) => d.estado === c.estado)
                  : null
              }
              destinos={destinos}
              bloqueado={bloqueado}
              onMover={onMover}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {activo && (
          <div className="tarjeta-interactiva w-66 cursor-grabbing p-3">
            <ContenidoTarjeta pedido={activo} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
