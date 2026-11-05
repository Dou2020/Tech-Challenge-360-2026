import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useAgrupacion } from './useAgrupacion';

function montar(ruta: string) {
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter>
  );
  return renderHook(() => ({ ...useAgrupacion(), ubicacion: useLocation() }), {
    wrapper: Envoltura,
  });
}

describe('useAgrupacion', () => {
  it.each([
    ['/r', 'dia'],
    ['/r?agrupacion=semana', 'semana'],
    ['/r?agrupacion=mes', 'mes'],
    ['/r?agrupacion=anio', 'dia'],
  ])('URL %s → agrupación %s', (ruta, esperada) => {
    // Act
    const { result } = montar(ruta);

    // Assert
    expect(result.current.agrupacion).toBe(esperada);
  });

  it('elegir semana → la guarda en la URL y conserva los demás parámetros', () => {
    // Arrange
    const { result } = montar('/r?desde=2026-11-01');

    // Act
    act(() => result.current.setAgrupacion('semana'));

    // Assert
    expect(result.current.agrupacion).toBe('semana');
    expect(result.current.ubicacion.search).toBe('?desde=2026-11-01&agrupacion=semana');
  });

  it('volver a día → quita el parámetro de la URL', () => {
    // Arrange
    const { result } = montar('/r?agrupacion=mes&desde=2026-11-01');

    // Act
    act(() => result.current.setAgrupacion('dia'));

    // Assert
    expect(result.current.agrupacion).toBe('dia');
    expect(result.current.ubicacion.search).toBe('?desde=2026-11-01');
  });
});
