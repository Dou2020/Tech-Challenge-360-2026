import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationTimer } from './ReservationTimer';

describe('ReservationTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-03T15:30:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('cuenta hacia atrás y avisa una sola vez al llegar a 0', () => {
    // Arrange
    const onVencida = vi.fn();
    render(<ReservationTimer expiraEn="2026-11-03T15:30:03Z" onVencida={onVencida} />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:03');

    // Act
    act(() => void vi.advanceTimersByTime(2000));

    // Assert
    expect(screen.getByRole('timer')).toHaveTextContent('0:01');
    expect(onVencida).not.toHaveBeenCalled();

    // Act
    act(() => void vi.advanceTimersByTime(5000));

    // Assert
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(onVencida).toHaveBeenCalledTimes(1);
  });

  it('muestra minutos y segundos', () => {
    // Arrange / Act
    render(<ReservationTimer expiraEn="2026-11-03T15:44:30Z" onVencida={vi.fn()} />);

    // Assert
    expect(screen.getByRole('timer')).toHaveTextContent('14:30');
  });
});
