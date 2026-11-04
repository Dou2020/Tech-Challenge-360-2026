import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkoutApi } from '../../services/api/checkout';
import { ApiError } from '../../services/http';
import type { SolicitudPago } from '../../types/checkout';

const claveResumen = (idMetodoEnvio: number | null) =>
  ['checkout', 'resumen', idMetodoEnvio] as const;

/**
 * Resumen de la reserva vigente (para retomar tras recargar). Sin reintentos ni refresco
 * automático: la existencia se reservó al iniciar y un 409 significa que ya no hay reserva.
 */
export function useResumenCheckout(idMetodoEnvio: number | null) {
  return useQuery({
    queryKey: claveResumen(idMetodoEnvio),
    queryFn: () => checkoutApi.obtenerResumen(idMetodoEnvio as number),
    enabled: idMetodoEnvio !== null,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Reserva la existencia y deja el resumen en la caché. */
export function useIniciarCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idDireccion, idMetodoEnvio }: { idDireccion: number; idMetodoEnvio: number }) =>
      checkoutApi.iniciar(idDireccion, idMetodoEnvio),
    onSuccess: (resumen, { idMetodoEnvio }) =>
      queryClient.setQueryData(claveResumen(idMetodoEnvio), resumen),
  });
}

/** Libera la reserva y olvida el resumen guardado. */
export function useLiberarReserva() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => checkoutApi.liberarReserva(),
    onSettled: () => queryClient.removeQueries({ queryKey: ['checkout', 'resumen'] }),
  });
}

/** Pago idempotente. La clave la decide quien llama (ver utils/idempotencia.ts). */
export function usePagar() {
  return useMutation({
    mutationFn: ({ solicitud, clave }: { solicitud: SolicitudPago; clave: string }) =>
      checkoutApi.pagar(solicitud, clave),
  });
}

/** Un 409 RESERVA_VENCIDA o un resumen sin reserva significan que hay que volver a iniciar. */
export function esReservaVencida(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'RESERVA_VENCIDA';
}
