import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Inicio } from './router';
import { sistemaApi } from './services/api/sistema';
import { ApiError } from './services/http';
import { renderizar } from './test/renderizar';

vi.mock('./services/api/sistema', () => ({
  sistemaApi: { obtenerEstado: vi.fn() },
}));

const obtenerEstado = vi.mocked(sistemaApi.obtenerEstado);

describe('Inicio (marcador provisional)', () => {
  beforeEach(() => {
    obtenerEstado.mockReset();
  });

  it('muestra el estado de la API, SQL Server y Redis', async () => {
    obtenerEstado.mockResolvedValue({
      status: 'degradado',
      sqlServer: 'up',
      redis: 'down',
      timestamp: '2026-11-03T15:30:00Z',
    });

    renderizar(<Inicio />);

    expect(screen.getByRole('status')).toHaveTextContent('Consultando la API');
    expect(await screen.findByText('API: degradado')).toBeInTheDocument();
    expect(screen.getByText('SQL Server: up')).toBeInTheDocument();
    expect(screen.getByText('Redis: down')).toBeInTheDocument();
  });

  it('muestra el error si la API no responde', async () => {
    obtenerEstado.mockRejectedValue(
      new ApiError(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'),
    );

    renderizar(<Inicio />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor.',
    );
  });
});
