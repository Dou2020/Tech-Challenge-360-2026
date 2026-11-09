import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkoutApi } from '../../services/api/checkout';
import { ApiError } from '../../services/http';
import type { PedidoCreado, ResumenCheckout } from '../../types/checkout';
import {
  esReservaVencida,
  useIniciarCheckout,
  useLiberarReserva,
  usePagar,
  useResumenCheckout,
} from './useCheckout';

vi.mock('../../services/api/checkout', () => ({
  checkoutApi: {
    iniciar: vi.fn(),
    obtenerResumen: vi.fn(),
    liberarReserva: vi.fn(),
    pagar: vi.fn(),
  },
}));
const api = vi.mocked(checkoutApi);

const resumen: ResumenCheckout = {
  idCarrito: 88,
  items: [],
  cupon: null,
  cantidadLineas: 1,
  cantidadUnidades: 2,
  subtotal: '298.00',
  descuento: '0.00',
  costoEnvio: '25.00',
  total: '310.00',
  porcentajeIVA: '12.00',
  montoIVA: '33.21',
  metodoEnvio: { idMetodoEnvio: 2, nombre: 'Estándar', diasEstimados: 3 },
  reservaVigente: true,
  reservaExpiraEn: '2026-11-03T15:45:00.000Z',
};

function contexto() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Envoltura, queryClient };
}

describe('useCheckout', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it('useResumenCheckout sin método de envío → no consulta', () => {
    // Arrange
    const { Envoltura } = contexto();

    // Act
    renderHook(() => useResumenCheckout(null), { wrapper: Envoltura });

    // Assert
    expect(api.obtenerResumen).not.toHaveBeenCalled();
  });

  it('useResumenCheckout con método de envío → pide el resumen con ese método', async () => {
    // Arrange
    api.obtenerResumen.mockResolvedValue(resumen);
    const { Envoltura } = contexto();

    // Act
    const { result } = renderHook(() => useResumenCheckout(2), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(resumen));
    expect(api.obtenerResumen).toHaveBeenCalledWith(2);
  });

  it('useResumenCheckout con 409 → no reintenta', async () => {
    // Arrange
    api.obtenerResumen.mockRejectedValue(
      new ApiError(409, 'RESERVA_VENCIDA', 'La reserva venció.'),
    );
    const { Envoltura } = contexto();

    // Act
    const { result } = renderHook(() => useResumenCheckout(2), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.obtenerResumen).toHaveBeenCalledTimes(1);
  });

  it('useIniciarCheckout → reserva y deja el resumen en la caché', async () => {
    // Arrange
    api.iniciar.mockResolvedValue(resumen);
    const { Envoltura, queryClient } = contexto();
    const { result } = renderHook(() => useIniciarCheckout(), { wrapper: Envoltura });

    // Act
    result.current.mutate({ idDireccion: 5, idMetodoEnvio: 2 });

    // Assert
    await waitFor(() =>
      expect(queryClient.getQueryData(['checkout', 'resumen', 2])).toEqual(resumen),
    );
    expect(api.iniciar).toHaveBeenCalledWith({ idDireccion: 5, idMetodoEnvio: 2 });
  });

  it('useLiberarReserva → libera y olvida los resúmenes guardados', async () => {
    // Arrange
    api.liberarReserva.mockResolvedValue(undefined);
    const { Envoltura, queryClient } = contexto();
    queryClient.setQueryData(['checkout', 'resumen', 2], resumen);
    const { result } = renderHook(() => useLiberarReserva(), { wrapper: Envoltura });

    // Act
    result.current.mutate();

    // Assert
    await waitFor(() =>
      expect(queryClient.getQueryData(['checkout', 'resumen', 2])).toBeUndefined(),
    );
    expect(api.liberarReserva).toHaveBeenCalledTimes(1);
  });

  it('usePagar → manda la solicitud con la clave que decide quien llama', async () => {
    // Arrange
    const creado: PedidoCreado = {
      idPedido: 1503,
      numeroPedido: 'SC-2026-001503',
      estado: 'PAGADO',
      total: '310.00',
      idTarjetaGuardada: null,
    };
    api.pagar.mockResolvedValue(creado);
    const { Envoltura } = contexto();
    const { result } = renderHook(() => usePagar(), { wrapper: Envoltura });
    const solicitud = {
      idDireccion: 5,
      idMetodoEnvio: 2,
      metodoPago: 'TARJETA' as const,
      datosPago: { titular: 'Ana López', ultimos4: '4242' },
    };

    // Act
    result.current.mutate({ solicitud, clave: 'clave-1' });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(creado));
    expect(api.pagar).toHaveBeenCalledWith(solicitud, 'clave-1');
  });

  it.each([
    [new ApiError(409, 'RESERVA_VENCIDA', 'La reserva venció.'), true],
    [new ApiError(409, 'STOCK_INSUFICIENTE', 'Sin stock.'), false],
    [new Error('RESERVA_VENCIDA'), false],
  ])('esReservaVencida(%j) → %s', (error, esperado) => {
    // Act & Assert
    expect(esReservaVencida(error)).toBe(esperado);
  });
});
