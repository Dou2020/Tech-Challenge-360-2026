import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportesApi } from '../../services/api/reportes';
import {
  useCarritosAbandonados,
  useProductosMasVendidos,
  useResumenReportes,
  useVentasPorCategoria,
  useVentasPorPeriodo,
} from './useReportes';

vi.mock('../../services/api/reportes', () => ({
  reportesApi: {
    resumen: vi.fn(),
    ventas: vi.fn(),
    ventasPorCategoria: vi.fn(),
    productosMasVendidos: vi.fn(),
    carritosAbandonados: vi.fn(),
  },
}));
const api = vi.mocked(reportesApi);
const rango = { desde: '2026-11-01', hasta: '2026-11-30' };

function Envoltura({ children }: { children: ReactNode }) {
  const [cliente] = [new QueryClient({ defaultOptions: { queries: { retry: false } } })];
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

describe('useReportes', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset().mockResolvedValue([] as never));
  });

  it.each([
    ['resumen', () => useResumenReportes(rango), api.resumen, [rango]],
    [
      'ventas',
      () => useVentasPorPeriodo(rango, 'mes'),
      api.ventas,
      [{ ...rango, agrupacion: 'mes' }],
    ],
    ['categorías', () => useVentasPorCategoria(rango), api.ventasPorCategoria, [rango]],
    [
      'top',
      () => useProductosMasVendidos(rango, 5),
      api.productosMasVendidos,
      [{ ...rango, limite: 5 }],
    ],
    [
      'carritos',
      () => useCarritosAbandonados({ ...rango, page: 2 }),
      api.carritosAbandonados,
      [{ ...rango, page: 2 }],
    ],
  ] as const)('%s habilitado → llama a la API con el rango', async (_n, usar, fn, args) => {
    // Act
    const { result } = renderHook(usar as () => { isSuccess: boolean }, { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fn).toHaveBeenCalledWith(...args);
  });

  it.each([
    ['resumen', () => useResumenReportes(rango, false), api.resumen],
    ['ventas', () => useVentasPorPeriodo(rango, 'dia', false), api.ventas],
    ['categorías', () => useVentasPorCategoria(rango, false), api.ventasPorCategoria],
    ['top', () => useProductosMasVendidos(rango, 10, false), api.productosMasVendidos],
    ['carritos', () => useCarritosAbandonados(rango, false), api.carritosAbandonados],
  ] as const)('%s con rango inválido (deshabilitado) → no consulta', (_n, usar, fn) => {
    // Act
    renderHook(usar as () => { isSuccess: boolean }, { wrapper: Envoltura });

    // Assert
    expect(fn).not.toHaveBeenCalled();
  });

  it('top sin límite → pide 10', async () => {
    // Act
    const { result } = renderHook(() => useProductosMasVendidos(rango), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.productosMasVendidos).toHaveBeenCalledWith({ ...rango, limite: 10 });
  });
});
