import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { pedidosApi } from '../../services/api/pedidos';
import { ApiError } from '../../services/http';
import type { DatosDevolucion, TransicionPedido } from '../../types/pedidos';

/** Todas las claves cuelgan de ['pedidos'] para invalidar lista, detalle e historial juntos. */
export const CLAVE_PEDIDOS = ['pedidos'] as const;

/** Lista paginada del lado del servidor; conserva la página anterior mientras carga la siguiente. */
export function usePedidos(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: [...CLAVE_PEDIDOS, 'lista', params],
    queryFn: () => pedidosApi.listar(params),
    placeholderData: keepPreviousData,
  });
}

/**
 * Total de pedidos en cada estado (una página de tamaño 1 por estado; solo se usa `total`).
 * Comparte las claves de `usePedidos`, así que cualquier mutación de pedidos también los refresca.
 */
export function useTotalesPedidos(estados: readonly string[]) {
  return useQueries({
    queries: estados.map((estado) => {
      const params = { estado, page: 1, pageSize: 1 };
      return {
        queryKey: [...CLAVE_PEDIDOS, 'lista', params],
        queryFn: () => pedidosApi.listar(params),
      };
    }),
    combine: (resultados) => ({
      totales: resultados.map((r) => r.data?.total),
      isPending: resultados.some((r) => r.isPending),
      error: resultados.find((r) => r.isError)?.error ?? null,
      refetch: () => {
        for (const r of resultados) void r.refetch();
      },
    }),
  });
}

/** Tarjetas que muestra cada columna del tablero; el resto se ve en la lista filtrada. */
export const TAMANO_COLUMNA_TABLERO = 20;

/**
 * Tablero de pedidos: la primera página de cada estado, con los mismos filtros (número, fechas,
 * cliente) en todas las columnas. Comparte las claves de `usePedidos`, así que cualquier mutación de
 * pedidos también refresca el tablero.
 */
export function useTableroPedidos(
  columnas: readonly { estado: string; sort: string }[],
  filtros: Record<string, string | number | undefined>,
) {
  return useQueries({
    queries: columnas.map(({ estado, sort }) => {
      const params = { ...filtros, estado, sort, page: 1, pageSize: TAMANO_COLUMNA_TABLERO };
      return {
        queryKey: [...CLAVE_PEDIDOS, 'lista', params],
        queryFn: () => pedidosApi.listar(params),
        placeholderData: keepPreviousData,
      };
    }),
  });
}

export function usePedido(id: number) {
  return useQuery({
    queryKey: [...CLAVE_PEDIDOS, 'detalle', id],
    queryFn: () => pedidosApi.obtener(id),
    enabled: Number.isInteger(id) && id > 0,
    staleTime: 0,
  });
}

export function useHistorialPedido(id: number) {
  return useQuery({
    queryKey: [...CLAVE_PEDIDOS, 'historial', id],
    queryFn: () => pedidosApi.historial(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function useDevolucionesPedido(id: number) {
  return useQuery({
    queryKey: [...CLAVE_PEDIDOS, 'devoluciones', id],
    queryFn: () => pedidosApi.devoluciones(id),
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function useEstadosPedido() {
  return useQuery({
    queryKey: [...CLAVE_PEDIDOS, 'estados'],
    queryFn: pedidosApi.estados,
    staleTime: 10 * 60_000,
  });
}

/** Cancela y refresca detalle, historial y lista con la respuesta y una invalidación. */
export function useCancelarPedido(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (motivo?: string) => pedidosApi.cancelar(id, motivo),
    onSuccess: (detalle) => {
      queryClient.setQueryData([...CLAVE_PEDIDOS, 'detalle', id], detalle);
      void queryClient.invalidateQueries({ queryKey: CLAVE_PEDIDOS });
      // Cancelar devuelve existencia y libera el cupón: el carrito puede haber cambiado.
      void queryClient.invalidateQueries({ queryKey: ['carrito'] });
      void queryClient.invalidateQueries({ queryKey: ['inventario'] });
    },
  });
}

/** Avanza el estado y refresca detalle, historial, devoluciones y lista. */
export function useCambiarEstadoPedido(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ estado, comentario }: { estado: string; comentario?: string }) =>
      pedidosApi.cambiarEstado(id, estado, comentario),
    onSuccess: (detalle) => {
      queryClient.setQueryData([...CLAVE_PEDIDOS, 'detalle', id], detalle);
      void queryClient.invalidateQueries({ queryKey: CLAVE_PEDIDOS });
    },
  });
}

/** Registra una devolución: reintegra existencia, así que también refresca el inventario. */
export function useRegistrarDevolucion(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: DatosDevolucion) => pedidosApi.registrarDevolucion(id, datos),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_PEDIDOS });
      void queryClient.invalidateQueries({ queryKey: ['inventario'] });
    },
  });
}

/**
 * Mueve un pedido cualquiera (el tablero no tiene un id fijo): `via` elige el endpoint, como en el
 * detalle (`ESTADO` → PATCH /estado, `CANCELAR` → POST /cancelar). `texto` es el comentario o el motivo.
 */
export function useTransicionarPedido() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      idPedido,
      estado,
      via,
      texto,
    }: {
      idPedido: number;
      estado: string;
      via: Exclude<TransicionPedido['via'], 'DEVOLUCION'>;
      texto?: string | undefined;
    }) =>
      via === 'CANCELAR'
        ? pedidosApi.cancelar(idPedido, texto)
        : pedidosApi.cambiarEstado(idPedido, estado, texto),
    onSuccess: (detalle, { via }) => {
      queryClient.setQueryData([...CLAVE_PEDIDOS, 'detalle', detalle.idPedido], detalle);
      void queryClient.invalidateQueries({ queryKey: CLAVE_PEDIDOS });
      if (via === 'CANCELAR') {
        // Cancelar devuelve existencia y libera el cupón.
        void queryClient.invalidateQueries({ queryKey: ['carrito'] });
        void queryClient.invalidateQueries({ queryKey: ['inventario'] });
      }
    },
    // Otro usuario ya cambió el pedido: se refresca el tablero para que la tarjeta quede donde está.
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'TRANSICION_NO_PERMITIDA')
        void queryClient.invalidateQueries({ queryKey: CLAVE_PEDIDOS });
    },
  });
}
