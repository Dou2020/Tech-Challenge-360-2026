import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { sistemaApi } from '../../services/api/sistema';
import { useEstadoSistema } from './useEstadoSistema';

vi.mock('../../services/api/sistema', () => ({ sistemaApi: { obtenerEstado: vi.fn() } }));

describe('useEstadoSistema', () => {
  it('consulta el estado del sistema y lo devuelve', async () => {
    // Arrange
    const estado = {
      status: 'ok' as const,
      sqlServer: 'up' as const,
      redis: 'up' as const,
      timestamp: '2026-11-03T15:30:00.000Z',
    };
    vi.mocked(sistemaApi.obtenerEstado).mockResolvedValue(estado);
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const Envoltura = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
    );

    // Act
    const { result } = renderHook(() => useEstadoSistema(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(estado));
  });
});
