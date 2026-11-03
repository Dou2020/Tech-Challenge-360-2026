import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from './Notice';

describe('Notice', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('error → role alert con la referencia (requestId)', () => {
    // Act
    render(<Notice aviso={{ tipo: 'error', mensaje: 'Falló', referencia: 'req-9' }} />);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Falló');
    expect(screen.getByText('Referencia: req-9')).toBeInTheDocument();
  });

  it.each(['exito', 'info'] as const)('%s → role status', (tipo) => {
    // Act
    render(<Notice aviso={{ tipo, mensaje: 'Listo' }} />);

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Listo');
  });

  it('sin onCerrar → no muestra el botón de cierre', () => {
    // Act
    render(<Notice aviso={{ tipo: 'info', mensaje: 'Hola' }} />);

    // Assert
    expect(screen.queryByRole('button', { name: 'Cerrar aviso' })).not.toBeInTheDocument();
  });

  it('clic en cerrar → llama a onCerrar', async () => {
    // Arrange
    const onCerrar = vi.fn();
    render(<Notice aviso={{ tipo: 'error', mensaje: 'Falló' }} onCerrar={onCerrar} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));

    // Assert
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it.each(['exito', 'info'] as const)('%s → se cierra solo al pasar la duración', (tipo) => {
    // Arrange
    const onCerrar = vi.fn();
    render(<Notice aviso={{ tipo, mensaje: 'Listo' }} onCerrar={onCerrar} duracionMs={3000} />);

    // Act
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Assert
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('antes de la duración → no se cierra', () => {
    // Arrange
    const onCerrar = vi.fn();
    render(
      <Notice aviso={{ tipo: 'exito', mensaje: 'Listo' }} onCerrar={onCerrar} duracionMs={3000} />,
    );

    // Act
    act(() => {
      vi.advanceTimersByTime(2999);
    });

    // Assert
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('error → no se cierra solo', () => {
    // Arrange
    const onCerrar = vi.fn();
    render(
      <Notice aviso={{ tipo: 'error', mensaje: 'Falló' }} onCerrar={onCerrar} duracionMs={1000} />,
    );

    // Act
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    // Assert
    expect(onCerrar).not.toHaveBeenCalled();
  });
});
