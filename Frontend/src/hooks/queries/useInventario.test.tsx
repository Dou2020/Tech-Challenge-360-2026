import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inventarioApi } from '../../services/api/inventario';
import {
  CLAVE_INVENTARIO,
  useExistencias,
  useKardex,
  useRegistrarMovimiento,
  useTiposMovimiento,
} from './useInventario';

vi.mock('../../services/api/inventario', () => ({
  inventarioApi: {
    existencias: vi.fn(),
    kardex: vi.fn(),
    tiposMovimiento: vi.fn(),
    registrarEntrada: vi.fn(),
    registrarAjuste: vi.fn(),
  },
}));
const api = vi.mocked(inventarioApi);

function contexto() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Envoltura, queryClient };
}

describe('useInventario', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it('useExistencias → pasa los parámetros a la API', async () => {
    // Arrange
    const pagina = { items: [], page: 1, pageSize: 20, total: 0 };
    api.existencias.mockResolvedValue(pagina);
    const { Envoltura } = contexto();

    // Act
    const { result } = renderHook(() => useExistencias({ q: 'CAM', page: 1 }), {
      wrapper: Envoltura,
    });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(pagina));
    expect(api.existencias).toHaveBeenCalledWith({ q: 'CAM', page: 1 });
  });

  it('useKardex con id válido → consulta; con id inválido → no consulta', async () => {
    // Arrange
    api.kardex.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const { Envoltura } = contexto();

    // Act
    const valido = renderHook(() => useKardex(41, { page: 1 }), { wrapper: Envoltura });
    renderHook(() => useKardex(0, {}), { wrapper: Envoltura });
    renderHook(() => useKardex(Number.NaN, {}), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(valido.result.current.isSuccess).toBe(true));
    expect(api.kardex).toHaveBeenCalledTimes(1);
    expect(api.kardex).toHaveBeenCalledWith(41, { page: 1 });
  });

  it('useTiposMovimiento → devuelve los tipos', async () => {
    // Arrange
    const tipos = [
      { idTipoMovimientoInventario: 1, codigo: 'ENTRADA_COMPRA', nombre: 'Entrada', signo: 1 },
    ];
    api.tiposMovimiento.mockResolvedValue(tipos);
    const { Envoltura } = contexto();

    // Act
    const { result } = renderHook(() => useTiposMovimiento(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(tipos));
  });

  it('entrada por compra → llama a registrarEntrada (sin motivo vacío) e invalida el inventario', async () => {
    // Arrange
    api.registrarEntrada.mockResolvedValue({} as never);
    const { Envoltura, queryClient } = contexto();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRegistrarMovimiento(), { wrapper: Envoltura });

    // Act
    result.current.mutate({ clase: 'ENTRADA_COMPRA', idVariante: 41, cantidad: 5 });

    // Assert
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: CLAVE_INVENTARIO }));
    expect(api.registrarEntrada).toHaveBeenCalledWith({ idVariante: 41, cantidad: 5 });
  });

  it('entrada por compra con motivo → lo incluye', async () => {
    // Arrange
    api.registrarEntrada.mockResolvedValue({} as never);
    const { Envoltura } = contexto();
    const { result } = renderHook(() => useRegistrarMovimiento(), { wrapper: Envoltura });

    // Act
    result.current.mutate({
      clase: 'ENTRADA_COMPRA',
      idVariante: 41,
      cantidad: 5,
      motivo: 'Proveedor',
    });

    // Assert
    await waitFor(() =>
      expect(api.registrarEntrada).toHaveBeenCalledWith({
        idVariante: 41,
        cantidad: 5,
        motivo: 'Proveedor',
      }),
    );
  });

  it('ajuste → llama a registrarAjuste con tipo, cantidad y motivo', async () => {
    // Arrange
    api.registrarAjuste.mockResolvedValue({} as never);
    const { Envoltura } = contexto();
    const { result } = renderHook(() => useRegistrarMovimiento(), { wrapper: Envoltura });

    // Act
    result.current.mutate({
      clase: 'AJUSTE',
      idVariante: 41,
      tipo: 'SALIDA',
      cantidad: 2,
      motivo: 'Merma',
    });

    // Assert
    await waitFor(() =>
      expect(api.registrarAjuste).toHaveBeenCalledWith({
        idVariante: 41,
        tipo: 'SALIDA',
        cantidad: 2,
        motivo: 'Merma',
      }),
    );
    expect(api.registrarEntrada).not.toHaveBeenCalled();
  });
});
