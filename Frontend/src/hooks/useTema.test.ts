import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { simularTemaSistema } from '../test/matchMedia';
import { CLAVE_TEMA } from '../utils/tema';
import { useTema } from './useTema';

describe('useTema', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.unstubAllGlobals();
  });

  it('sin preferencia guardada sigue al sistema', () => {
    // Arrange
    simularTemaSistema(true);

    // Act
    const { result } = renderHook(() => useTema());

    // Assert
    expect(result.current.preferencia).toBe('sistema');
    expect(result.current.tema).toBe('oscuro');
  });

  it('elegir oscuro cambia el tema, la clase de <html> y lo guarda', () => {
    // Arrange
    simularTemaSistema(false);
    const { result } = renderHook(() => useTema());

    // Act
    act(() => result.current.cambiarPreferencia('oscuro'));

    // Assert
    expect(result.current.preferencia).toBe('oscuro');
    expect(result.current.tema).toBe('oscuro');
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro');
  });

  it('con preferencia sistema, un cambio del sistema operativo cambia el tema', () => {
    // Arrange
    const sistema = simularTemaSistema(false);
    const { result } = renderHook(() => useTema());

    // Act
    act(() => sistema.cambiar(true));

    // Assert
    expect(result.current.tema).toBe('oscuro');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('un cambio hecho en otra pestaña se refleja aquí', () => {
    // Arrange
    simularTemaSistema(false);
    const { result } = renderHook(() => useTema());
    localStorage.setItem(CLAVE_TEMA, 'oscuro');

    // Act
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_TEMA }));
    });

    // Assert
    expect(result.current.preferencia).toBe('oscuro');
    expect(document.documentElement).toHaveClass('dark');
  });
});
