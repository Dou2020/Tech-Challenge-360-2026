import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type ContextoAuth } from '../../auth/authContext';
import { carritoApi } from '../../services/api/carrito';
import { crearCarrito } from '../../test/fixtures/carrito';
import { crearAdmin, crearCliente, crearOperador } from '../../test/fixtures/usuarios';
import { crearAuth } from '../../test/renderizar';
import { guestCart } from '../../utils/guestCart';
import {
  CLAVE_CARRITO,
  useActualizarCantidad,
  useAgregarItem,
  useAplicarCupon,
  useCarrito,
  useEliminarItem,
  useQuitarCupon,
  useVaciarCarrito,
} from './useCarrito';

vi.mock('../../services/api/carrito', () => ({
  carritoApi: {
    obtener: vi.fn(),
    agregarItem: vi.fn(),
    actualizarCantidad: vi.fn(),
    eliminarItem: vi.fn(),
    vaciar: vi.fn(),
    aplicarCupon: vi.fn(),
    quitarCupon: vi.fn(),
  },
}));
const api = vi.mocked(carritoApi);

function envoltura(auth: ContextoAuth) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Envoltura({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext value={auth}>{children}</AuthContext>
      </QueryClientProvider>
    );
  }
  return { Envoltura, queryClient };
}

describe('useCarrito', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.obtener.mockResolvedValue(crearCarrito());
  });
  afterEach(() => localStorage.clear());

  it('Cliente autenticado → consulta el carrito', async () => {
    // Arrange
    const { Envoltura } = envoltura(crearAuth({ usuario: crearCliente(), estado: 'autenticado' }));

    // Act
    const { result } = renderHook(() => useCarrito(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(crearCarrito()));
    expect(api.obtener).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Operador', crearOperador()],
    ['Administrador', crearAdmin()],
  ])('%s → no consulta el carrito (la API respondería 403)', (_rol, usuario) => {
    // Arrange
    const { Envoltura } = envoltura(crearAuth({ usuario, estado: 'autenticado' }));

    // Act
    renderHook(() => useCarrito(), { wrapper: Envoltura });

    // Assert
    expect(api.obtener).not.toHaveBeenCalled();
  });

  it('invitado con token → consulta el carrito', async () => {
    // Arrange
    guestCart.guardar('tok-1');
    const { Envoltura } = envoltura(crearAuth());

    // Act
    const { result } = renderHook(() => useCarrito(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.obtener).toHaveBeenCalledTimes(1);
  });

  it('invitado sin token → no consulta el carrito', () => {
    // Arrange
    const { Envoltura } = envoltura(crearAuth());

    // Act
    renderHook(() => useCarrito(), { wrapper: Envoltura });

    // Assert
    expect(api.obtener).not.toHaveBeenCalled();
  });

  it('sesión cargando → no consulta aunque haya token', () => {
    // Arrange
    guestCart.guardar('tok-1');
    const { Envoltura } = envoltura(crearAuth({ estado: 'cargando' }));

    // Act
    renderHook(() => useCarrito(), { wrapper: Envoltura });

    // Assert
    expect(api.obtener).not.toHaveBeenCalled();
  });
});

describe('mutaciones del carrito', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  const casos = [
    ['useAgregarItem', useAgregarItem, 'agregarItem', { idVariante: 41, cantidad: 2 }, [41, 2]],
    [
      'useActualizarCantidad',
      useActualizarCantidad,
      'actualizarCantidad',
      { idVariante: 41, cantidad: 3 },
      [41, 3],
    ],
    ['useEliminarItem', useEliminarItem, 'eliminarItem', 41, [41]],
    ['useVaciarCarrito', useVaciarCarrito, 'vaciar', undefined, []],
    ['useAplicarCupon', useAplicarCupon, 'aplicarCupon', 'VERANO25', ['VERANO25']],
    ['useQuitarCupon', useQuitarCupon, 'quitarCupon', undefined, []],
  ] as const;

  it.each(casos)(
    '%s → llama a la API y escribe el carrito devuelto en la caché',
    async (_nombre, usarHook, metodo, variables, argumentos) => {
      // Arrange
      const nuevo = crearCarrito({ total: '271.50' });
      api[metodo].mockResolvedValue(nuevo);
      const { Envoltura, queryClient } = envoltura(
        crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
      );
      const { result } = renderHook(() => usarHook(), { wrapper: Envoltura });

      // Act
      result.current.mutate(variables as never);

      // Assert
      await waitFor(() => expect(queryClient.getQueryData(CLAVE_CARRITO)).toEqual(nuevo));
      expect(api[metodo]).toHaveBeenCalledWith(...argumentos);
    },
  );
});
