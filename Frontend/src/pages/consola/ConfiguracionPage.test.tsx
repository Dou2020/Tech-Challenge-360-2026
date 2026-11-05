import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configuracionApi } from '../../services/api/administracion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import ConfiguracionPage from './ConfiguracionPage';

vi.mock('../../services/api/administracion', () => ({
  configuracionApi: { listar: vi.fn(), actualizar: vi.fn() },
}));
const api = vi.mocked(configuracionApi);

const parametros = [
  { idConfiguracion: 1, clave: 'MinutosReserva', valor: '15', descripcion: 'Minutos de reserva' },
  { idConfiguracion: 2, clave: 'PorcentajeIVA', valor: '12.00', descripcion: null },
];

describe('ConfiguracionPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.listar.mockResolvedValue(parametros);
  });

  it('un valor fuera de rango se rechaza sin llamar a la API', async () => {
    // Arrange
    renderizar(<ConfiguracionPage />);
    const campo = await screen.findByLabelText('Valor de MinutosReserva');
    await userEvent.clear(campo);
    await userEvent.type(campo, '500');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar MinutosReserva' }));

    // Assert
    expect(await screen.findByText('Entero de 1 a 120 minutos.')).toBeInTheDocument();
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(api.actualizar).not.toHaveBeenCalled();
  });

  it('guarda un valor válido y refresca la lista', async () => {
    // Arrange
    api.actualizar.mockResolvedValue({ ...parametros[0]!, valor: '20' });
    renderizar(<ConfiguracionPage />);
    const campo = await screen.findByLabelText('Valor de MinutosReserva');
    await userEvent.clear(campo);
    await userEvent.type(campo, '20');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar MinutosReserva' }));

    // Assert
    await waitFor(() => expect(api.actualizar).toHaveBeenCalledWith('MinutosReserva', '20'));
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
    await waitFor(() => expect(api.listar).toHaveBeenCalledTimes(2));
  });

  it('muestra el error de la API en el campo', async () => {
    // Arrange
    api.actualizar.mockRejectedValue(new ApiError(400, 'VALIDACION', 'Valor fuera de rango.'));
    renderizar(<ConfiguracionPage />);
    await screen.findByLabelText('Valor de PorcentajeIVA');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar PorcentajeIVA' }));

    // Assert
    expect(await screen.findByText('Valor fuera de rango.')).toBeInTheDocument();
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<ConfiguracionPage />);

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando configuración' })).toBeInTheDocument();
  });

  it('muestra cada parámetro con su valor y descripción', async () => {
    // Act
    renderizar(<ConfiguracionPage />);

    // Assert
    expect(await screen.findByLabelText('Valor de MinutosReserva')).toHaveValue('15');
    expect(screen.getByLabelText('Valor de PorcentajeIVA')).toHaveValue('12.00');
    expect(screen.getByText('Minutos de reserva')).toBeInTheDocument();
  });

  it('sin parámetros → EmptyState', async () => {
    // Arrange
    api.listar.mockResolvedValue([]);

    // Act
    renderizar(<ConfiguracionPage />);

    // Assert
    expect(await screen.findByText('Sin parámetros')).toBeInTheDocument();
  });

  it('error al cargar → ErrorState con requestId y Reintentar vuelve a pedirlos', async () => {
    // Arrange
    api.listar
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-51'))
      .mockResolvedValueOnce(parametros);
    renderizar(<ConfiguracionPage />);
    expect(await screen.findByText('Referencia: req-51')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByLabelText('Valor de MinutosReserva')).toBeInTheDocument();
    expect(api.listar).toHaveBeenCalledTimes(2);
  });

  it('el servidor devuelve otro valor tras guardar → el campo lo adopta', async () => {
    // Arrange
    api.actualizar.mockResolvedValue({ ...parametros[1]!, valor: '12.5' });
    api.listar
      .mockResolvedValueOnce(parametros)
      .mockResolvedValue([parametros[0]!, { ...parametros[1]!, valor: '12.5' }]);
    renderizar(<ConfiguracionPage />);
    const campo = await screen.findByLabelText('Valor de PorcentajeIVA');
    await userEvent.clear(campo);
    await userEvent.type(campo, '12.50');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar PorcentajeIVA' }));

    // Assert
    await waitFor(() =>
      expect(screen.getByLabelText('Valor de PorcentajeIVA')).toHaveValue('12.5'),
    );
  });
});
