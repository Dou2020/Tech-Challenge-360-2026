import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sistemaApi } from '../../services/api/sistema';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import { EstadoSistema } from './EstadoSistema';

vi.mock('../../services/api/sistema', () => ({ sistemaApi: { obtenerEstado: vi.fn() } }));
const api = vi.mocked(sistemaApi.obtenerEstado);

describe('EstadoSistema', () => {
  beforeEach(() => {
    api.mockReset();
  });

  it('cargando → muestra el spinner', () => {
    // Arrange
    api.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<EstadoSistema />);

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
  });

  it('todo en línea → muestra "Operando" y ambas dependencias disponibles', async () => {
    // Arrange
    api.mockResolvedValue({
      status: 'ok',
      sqlServer: 'up',
      redis: 'up',
      timestamp: '2026-11-03T15:30:00.000Z',
    });

    // Act
    renderizar(<EstadoSistema />);

    // Assert
    expect(await screen.findByText('Operando')).toBeInTheDocument();
    expect(screen.getAllByText('Disponible')).toHaveLength(2);
    expect(screen.getByText(/3\/11\/2026, 9:30 a\. m\./)).toBeInTheDocument();
  });

  it('SQL Server caído → "Sin servicio" y esa dependencia sin conexión', async () => {
    // Arrange
    api.mockResolvedValue({
      status: 'caido',
      sqlServer: 'down',
      redis: 'up',
      timestamp: '2026-11-03T15:30:00.000Z',
    });

    // Act
    renderizar(<EstadoSistema />);

    // Assert
    expect(await screen.findByText('Sin servicio')).toBeInTheDocument();
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
  });

  it('error → ErrorState con requestId y Reintentar vuelve a consultar', async () => {
    // Arrange
    api
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-5'))
      .mockResolvedValueOnce({
        status: 'ok',
        sqlServer: 'up',
        redis: 'up',
        timestamp: '2026-11-03T15:30:00.000Z',
      });
    renderizar(<EstadoSistema />);
    expect(await screen.findByText('Referencia: req-5')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('Operando')).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('error que no es de la API → mensaje genérico', async () => {
    // Arrange
    api.mockRejectedValue(new Error('red'));

    // Act
    renderizar(<EstadoSistema />);

    // Assert
    expect(await screen.findByText('No se pudo consultar el estado.')).toBeInTheDocument();
  });
});
