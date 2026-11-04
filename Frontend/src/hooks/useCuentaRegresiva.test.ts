import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCuentaRegresiva } from './useCuentaRegresiva';

describe('useCuentaRegresiva', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-03T15:30:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve los segundos que faltan al montarse', () => {
    // Act
    const { result } = renderHook(() => useCuentaRegresiva('2026-11-03T15:44:30Z'));

    // Assert
    expect(result.current).toBe(870);
  });

  it('fecha ya pasada → 0 segundos', () => {
    // Act
    const { result } = renderHook(() => useCuentaRegresiva('2026-11-03T15:00:00Z'));

    // Assert
    expect(result.current).toBe(0);
  });

  it('cada segundo baja el contador', () => {
    // Arrange
    const { result } = renderHook(() => useCuentaRegresiva('2026-11-03T15:30:10Z'));

    // Act
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    // Assert
    expect(result.current).toBe(6);
  });

  it('al llegar a 0 → avisa una sola vez', () => {
    // Arrange
    const onVencida = vi.fn();
    renderHook(() => useCuentaRegresiva('2026-11-03T15:30:02Z', onVencida));

    // Act
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    // Assert
    expect(onVencida).toHaveBeenCalledTimes(1);
  });
});
