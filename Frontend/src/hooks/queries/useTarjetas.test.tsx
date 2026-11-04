import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tarjetasApi } from '../../services/api/tarjetas';
import { crearTarjeta } from '../../test/fixtures/tarjetas';
import {
  CLAVE_TARJETAS,
  useCrearTarjeta,
  useEliminarTarjeta,
  useMarcarTarjetaPredeterminada,
  useTarjetas,
} from './useTarjetas';

vi.mock('../../services/api/tarjetas', () => ({
  tarjetasApi: {
    listar: vi.fn(),
    crear: vi.fn(),
    marcarPredeterminada: vi.fn(),
    eliminar: vi.fn(),
  },
}));
const api = vi.mocked(tarjetasApi);

function contexto() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Envoltura, queryClient };
}

describe('useTarjetas', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it('pide la lista a la API bajo la clave ["tarjetas"]', async () => {
    // Arrange
    const tarjetas = [crearTarjeta()];
    api.listar.mockResolvedValue(tarjetas);
    const { Envoltura, queryClient } = contexto();

    // Act
    const { result } = renderHook(() => useTarjetas(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(tarjetas));
    expect(queryClient.getQueryData(CLAVE_TARJETAS)).toEqual(tarjetas);
    expect(CLAVE_TARJETAS).toEqual(['tarjetas']);
  });

  it('deshabilitado → no consulta', () => {
    // Arrange
    const { Envoltura } = contexto();

    // Act
    renderHook(() => useTarjetas(false), { wrapper: Envoltura });

    // Assert
    expect(api.listar).not.toHaveBeenCalled();
  });

  it('useCrearTarjeta → manda los datos e invalida ["tarjetas"]', async () => {
    // Arrange
    const datos = {
      titular: 'Ana López',
      ultimos4: '4242',
      tipo: 'CREDITO',
      marca: 'VISA',
    } as const;
    api.crear.mockResolvedValue(crearTarjeta());
    const { Envoltura, queryClient } = contexto();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCrearTarjeta(), { wrapper: Envoltura });

    // Act
    result.current.mutate(datos);

    // Assert
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tarjetas'] }));
    expect(api.crear).toHaveBeenCalledWith(datos);
  });

  it('useMarcarTarjetaPredeterminada → manda el id e invalida ["tarjetas"]', async () => {
    // Arrange
    api.marcarPredeterminada.mockResolvedValue(crearTarjeta({ idTarjeta: 4 }));
    const { Envoltura, queryClient } = contexto();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMarcarTarjetaPredeterminada(), { wrapper: Envoltura });

    // Act
    result.current.mutate(4);

    // Assert
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tarjetas'] }));
    expect(api.marcarPredeterminada).toHaveBeenCalledWith(4);
  });

  it('useEliminarTarjeta → manda el id e invalida ["tarjetas"]', async () => {
    // Arrange
    api.eliminar.mockResolvedValue(undefined);
    const { Envoltura, queryClient } = contexto();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useEliminarTarjeta(), { wrapper: Envoltura });

    // Act
    result.current.mutate(4);

    // Assert
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ['tarjetas'] }));
    expect(api.eliminar).toHaveBeenCalledWith(4);
  });

  it('una mutación que falla → no invalida la lista', async () => {
    // Arrange
    api.eliminar.mockRejectedValue(new Error('falla'));
    const { Envoltura, queryClient } = contexto();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useEliminarTarjeta(), { wrapper: Envoltura });

    // Act
    result.current.mutate(4);

    // Assert
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidar).not.toHaveBeenCalled();
  });
});
