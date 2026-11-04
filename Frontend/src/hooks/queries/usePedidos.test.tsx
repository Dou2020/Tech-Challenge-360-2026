import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pedidosApi } from '../../services/api/pedidos';
import { crearPedidoDetalle } from '../../test/fixtures/pedidos';
import {
  CLAVE_PEDIDOS,
  useCambiarEstadoPedido,
  useCancelarPedido,
  useDevolucionesPedido,
  useEstadosPedido,
  useHistorialPedido,
  usePedido,
  usePedidos,
  useRegistrarDevolucion,
} from './usePedidos';

vi.mock('../../services/api/pedidos', () => ({
  pedidosApi: {
    listar: vi.fn(),
    obtener: vi.fn(),
    historial: vi.fn(),
    devoluciones: vi.fn(),
    estados: vi.fn(),
    cancelar: vi.fn(),
    cambiarEstado: vi.fn(),
    registrarDevolucion: vi.fn(),
  },
}));
const api = vi.mocked(pedidosApi);

function contexto() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
  return { Envoltura, invalidar, queryClient };
}
const claves = (spy: ReturnType<typeof vi.spyOn>) =>
  (spy.mock.calls as unknown[][]).map((c) =>
    JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
  );

describe('usePedidos (consultas)', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset().mockResolvedValue({} as never));
  });

  it('usePedidos → pasa los parámetros a la API', async () => {
    // Arrange
    const { Envoltura } = contexto();

    // Act
    const { result } = renderHook(() => usePedidos({ estado: 'PAGADO', page: 2 }), {
      wrapper: Envoltura,
    });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.listar).toHaveBeenCalledWith({ estado: 'PAGADO', page: 2 });
  });

  it.each([
    ['usePedido', usePedido, api.obtener],
    ['useHistorialPedido', useHistorialPedido, api.historial],
    ['useDevolucionesPedido', useDevolucionesPedido, api.devoluciones],
  ] as const)('%s → consulta con id válido y no consulta con id inválido', async (_n, usar, fn) => {
    // Arrange
    const { Envoltura } = contexto();

    // Act
    const valido = renderHook(() => usar(1503), { wrapper: Envoltura });
    renderHook(() => usar(0), { wrapper: Envoltura });
    renderHook(() => usar(Number.NaN), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(valido.result.current.isSuccess).toBe(true));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1503);
  });

  it('useEstadosPedido → consulta los estados', async () => {
    // Arrange
    const { Envoltura } = contexto();

    // Act
    const { result } = renderHook(() => useEstadosPedido(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.estados).toHaveBeenCalledTimes(1);
  });
});

describe('usePedidos (mutaciones)', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it('cancelar → escribe el detalle e invalida pedidos, carrito e inventario', async () => {
    // Arrange
    const cancelado = crearPedidoDetalle({ estado: 'CANCELADO' });
    api.cancelar.mockResolvedValue(cancelado);
    const { Envoltura, invalidar, queryClient } = contexto();
    const { result } = renderHook(() => useCancelarPedido(1503), { wrapper: Envoltura });

    // Act
    result.current.mutate('Me equivoqué');

    // Assert
    await waitFor(() =>
      expect(queryClient.getQueryData([...CLAVE_PEDIDOS, 'detalle', 1503])).toEqual(cancelado),
    );
    expect(api.cancelar).toHaveBeenCalledWith(1503, 'Me equivoqué');
    expect(claves(invalidar)).toEqual(
      expect.arrayContaining(['["pedidos"]', '["carrito"]', '["inventario"]']),
    );
  });

  it('cambiar estado → llama a la API, escribe el detalle e invalida pedidos', async () => {
    // Arrange
    const detalle = crearPedidoDetalle({ estado: 'EN_PREPARACION' });
    api.cambiarEstado.mockResolvedValue(detalle);
    const { Envoltura, invalidar, queryClient } = contexto();
    const { result } = renderHook(() => useCambiarEstadoPedido(1503), { wrapper: Envoltura });

    // Act
    result.current.mutate({ estado: 'EN_PREPARACION', comentario: 'Empacado' });

    // Assert
    await waitFor(() =>
      expect(queryClient.getQueryData([...CLAVE_PEDIDOS, 'detalle', 1503])).toEqual(detalle),
    );
    expect(api.cambiarEstado).toHaveBeenCalledWith(1503, 'EN_PREPARACION', 'Empacado');
    expect(claves(invalidar)).toContain('["pedidos"]');
  });

  it('registrar devolución → llama a la API e invalida pedidos e inventario', async () => {
    // Arrange
    api.registrarDevolucion.mockResolvedValue({} as never);
    const { Envoltura, invalidar } = contexto();
    const { result } = renderHook(() => useRegistrarDevolucion(1503), { wrapper: Envoltura });
    const datos = { motivo: 'Defecto', lineas: [{ idPedidoDetalle: 3021, cantidad: 1 }] };

    // Act
    result.current.mutate(datos);

    // Assert
    await waitFor(() => expect(api.registrarDevolucion).toHaveBeenCalledWith(1503, datos));
    await waitFor(() =>
      expect(claves(invalidar)).toEqual(expect.arrayContaining(['["pedidos"]', '["inventario"]'])),
    );
  });
});
