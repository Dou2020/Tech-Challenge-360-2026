import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/useAuth';
import { carritoApi } from '../../services/api/carrito';
import type { Carrito } from '../../types/carrito';
import { guestCart } from '../../utils/guestCart';

export const CLAVE_CARRITO = ['carrito'] as const;

/**
 * Carrito actual. Solo lo consultan los Clientes y los invitados que ya tienen token:
 * Operador y Administrador no tienen carrito (la API responde 403).
 */
export function useCarrito() {
  const { usuario, estado } = useAuth();
  const habilitado =
    estado === 'autenticado'
      ? usuario?.rol === 'Cliente'
      : estado === 'anonimo' && !!guestCart.obtener();
  return useQuery({
    queryKey: CLAVE_CARRITO,
    queryFn: carritoApi.obtener,
    enabled: habilitado,
  });
}

/** Agrega una variante y escribe el carrito devuelto en la caché. */
export function useAgregarItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idVariante, cantidad }: { idVariante: number; cantidad: number }) =>
      carritoApi.agregarItem(idVariante, cantidad),
    onSuccess: (carrito: Carrito) => queryClient.setQueryData(CLAVE_CARRITO, carrito),
  });
}

/** Mutación del carrito: todas responden el carrito completo, que se escribe en la caché. */
function useMutacionCarrito<V>(mutationFn: (variables: V) => Promise<Carrito>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (carrito: Carrito) => queryClient.setQueryData(CLAVE_CARRITO, carrito),
  });
}

export const useActualizarCantidad = () =>
  useMutacionCarrito(({ idVariante, cantidad }: { idVariante: number; cantidad: number }) =>
    carritoApi.actualizarCantidad(idVariante, cantidad),
  );

export const useEliminarItem = () =>
  useMutacionCarrito((idVariante: number) => carritoApi.eliminarItem(idVariante));

export const useVaciarCarrito = () => useMutacionCarrito(() => carritoApi.vaciar());

export const useAplicarCupon = () =>
  useMutacionCarrito((codigo: string) => carritoApi.aplicarCupon(codigo));

export const useQuitarCupon = () => useMutacionCarrito(() => carritoApi.quitarCupon());
