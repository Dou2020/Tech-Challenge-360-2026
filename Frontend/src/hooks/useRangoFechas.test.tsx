import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useRangoFechas } from './useRangoFechas';

function montar(ruta: string) {
  let ubicacion = { search: '' };
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[ruta]}>
      {children}
      <Sonda />
    </MemoryRouter>
  );
  function Sonda() {
    ubicacion = useLocation();
    return null;
  }
  const vista = renderHook(() => useRangoFechas(), { wrapper: Envoltura });
  return { ...vista, ubicacion: () => ubicacion };
}

describe('useRangoFechas', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-15T18:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sin parámetros → últimos 30 días de Guatemala, válido y "por defecto"', () => {
    // Act
    const { result } = montar('/r');

    // Assert
    expect(result.current).toMatchObject({
      desde: '2026-10-17',
      hasta: '2026-11-15',
      valido: true,
      esPorDefecto: true,
    });
  });

  it('con desde y hasta en la URL → los usa y deja de ser por defecto', () => {
    // Act
    const { result } = montar('/r?desde=2026-11-01&hasta=2026-11-10');

    // Assert
    expect(result.current).toMatchObject({
      desde: '2026-11-01',
      hasta: '2026-11-10',
      valido: true,
      esPorDefecto: false,
    });
  });

  it('desde posterior a hasta → inválido', () => {
    // Act
    const { result } = montar('/r?desde=2026-11-20&hasta=2026-11-10');

    // Assert
    expect(result.current.valido).toBe(false);
  });

  it('formato de fecha inválido → usa el valor por defecto', () => {
    // Act
    const { result } = montar('/r?desde=ayer&hasta=2026-11-10');

    // Assert
    expect(result.current.desde).toBe('2026-10-17');
    expect(result.current.hasta).toBe('2026-11-10');
  });

  it('setRango → escribe en la URL y quita page', () => {
    // Arrange
    const { result, ubicacion } = montar('/r?page=3');

    // Act
    act(() => result.current.setRango({ desde: '2026-11-01' }));

    // Assert
    expect(ubicacion().search).toBe('?desde=2026-11-01');
  });

  it('restablecer → quita desde y hasta de la URL', () => {
    // Arrange
    const { result, ubicacion } = montar('/r?desde=2026-11-01&hasta=2026-11-10');

    // Act
    act(() => result.current.restablecer());

    // Assert
    expect(ubicacion().search).toBe('');
  });
});
