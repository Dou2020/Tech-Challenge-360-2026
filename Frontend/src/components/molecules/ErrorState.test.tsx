import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  it('ApiError → muestra su mensaje y su requestId', () => {
    // Arrange
    const error = new ApiError(500, 'ERROR_INTERNO', 'Error interno del servidor.', [], 'req-123');

    // Act
    render(<ErrorState error={error} />);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Error interno del servidor.');
    expect(screen.getByText('Referencia: req-123')).toBeInTheDocument();
  });

  it('error desconocido → mensaje genérico y sin referencia', () => {
    // Act
    render(<ErrorState error={new Error('boom')} />);

    // Assert
    expect(screen.getByText('No se pudo cargar la información.')).toBeInTheDocument();
    expect(screen.queryByText(/Referencia/)).not.toBeInTheDocument();
  });

  it('mensaje y referencia explícitos → tienen prioridad sobre el ApiError', () => {
    // Arrange
    const error = new ApiError(500, 'ERROR_INTERNO', 'Otro', [], 'req-1');

    // Act
    render(<ErrorState error={error} mensaje="Mensaje propio" referencia="ref-propia" />);

    // Assert
    expect(screen.getByText('Mensaje propio')).toBeInTheDocument();
    expect(screen.getByText('Referencia: ref-propia')).toBeInTheDocument();
  });

  it('clic en Reintentar → llama a onReintentar', async () => {
    // Arrange
    const onReintentar = vi.fn();
    render(<ErrorState onReintentar={onReintentar} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it('sin onReintentar → no muestra el botón', () => {
    // Act
    render(<ErrorState />);

    // Assert
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});
