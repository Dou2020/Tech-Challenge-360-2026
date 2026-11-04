import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { catalogoApi } from '../../services/api/catalogo';
import { useMetodosEnvio } from './useMetodosEnvio';

vi.mock('../../services/api/catalogo', () => ({ catalogoApi: { metodosEnvio: vi.fn() } }));

describe('useMetodosEnvio', () => {
  it('pide los métodos de envío a la API y devuelve su lista', async () => {
    // Arrange
    const metodos = [{ idMetodoEnvio: 2, nombre: 'Estándar', costo: '25.00', diasEstimados: 3 }];
    vi.mocked(catalogoApi.metodosEnvio).mockResolvedValue(metodos);
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Envoltura = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    );

    // Act
    const { result } = renderHook(() => useMetodosEnvio(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(metodos));
  });
});
