import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { atributosApi } from '../../services/api/gestion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import { AttributesPanel } from './AttributesPanel';

vi.mock('../../services/api/gestion', () => ({
  atributosApi: { listar: vi.fn(), crear: vi.fn(), agregarValor: vi.fn() },
}));
const api = vi.mocked(atributosApi);

describe('AttributesPanel', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.listar.mockResolvedValue([
      {
        idAtributo: 1,
        nombre: 'Talla',
        cantidadValores: 1,
        valores: [{ idValorAtributo: 2, valor: 'M', cantidadVariantes: 3 }],
      },
    ]);
  });

  it('agrega un valor a un atributo y vuelve a cargar la lista', async () => {
    // Arrange
    api.agregarValor.mockResolvedValue({
      idValorAtributo: 3,
      idAtributo: 1,
      atributo: 'Talla',
      valor: 'L',
    });
    renderizar(<AttributesPanel />);
    await userEvent.type(await screen.findByLabelText('Nuevo valor de Talla'), 'L');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar valor a Talla' }));

    // Assert
    await waitFor(() => expect(api.agregarValor).toHaveBeenCalledWith(1, 'L'));
    await waitFor(() => expect(api.listar).toHaveBeenCalledTimes(2));
  });

  it('crea un atributo nuevo', async () => {
    // Arrange
    api.crear.mockResolvedValue({ idAtributo: 2, nombre: 'Color' });
    renderizar(<AttributesPanel />);
    await userEvent.type(await screen.findByLabelText('Nuevo atributo'), 'Color');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear atributo' }));

    // Assert
    await waitFor(() => expect(api.crear).toHaveBeenCalledWith('Color'));
  });

  it('cargando → no muestra la lista todavía', () => {
    // Arrange
    api.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<AttributesPanel />);

    // Assert
    expect(screen.queryByText('Talla')).not.toBeInTheDocument();
  });

  it('sin atributos → lo indica', async () => {
    // Arrange
    api.listar.mockResolvedValue([]);

    // Act
    renderizar(<AttributesPanel />);

    // Assert
    expect(await screen.findByText('Todavía no hay atributos.')).toBeInTheDocument();
  });

  it('muestra los valores de cada atributo o "Sin valores"', async () => {
    // Arrange
    api.listar.mockResolvedValue([
      {
        idAtributo: 1,
        nombre: 'Talla',
        cantidadValores: 2,
        valores: [
          { idValorAtributo: 2, valor: 'M', cantidadVariantes: 3 },
          { idValorAtributo: 3, valor: 'L', cantidadVariantes: 0 },
        ],
      },
      { idAtributo: 2, nombre: 'Color', cantidadValores: 0, valores: [] },
    ]);

    // Act
    renderizar(<AttributesPanel />);

    // Assert
    expect(await screen.findByText('M, L')).toBeInTheDocument();
    expect(screen.getByText('Sin valores')).toBeInTheDocument();
  });

  it('error al listar → ErrorState con Reintentar', async () => {
    // Arrange
    api.listar
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-8'))
      .mockResolvedValueOnce([]);
    renderizar(<AttributesPanel />);
    expect(await screen.findByText('Referencia: req-8')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('Todavía no hay atributos.')).toBeInTheDocument();
  });

  it('crear atributo sin nombre → error y sin llamar a la API', async () => {
    // Arrange
    renderizar(<AttributesPanel />);
    await screen.findByText('Talla');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear atributo' }));

    // Assert
    expect(await screen.findByText('Ingresa el nombre del atributo.')).toBeInTheDocument();
    expect(api.crear).not.toHaveBeenCalled();
  });

  it('crear atributo repetido (DUPLICADO) → "Ya existe con ese nombre."', async () => {
    // Arrange
    api.crear.mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Duplicado.'));
    renderizar(<AttributesPanel />);
    await userEvent.type(await screen.findByLabelText('Nuevo atributo'), 'Talla');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear atributo' }));

    // Assert
    expect(await screen.findByText('Ya existe con ese nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nuevo atributo')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    [new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'), 'Falla del servidor.'],
    [new Error('red'), 'No se pudo crear el atributo.'],
  ])('crear atributo con error (%#) → mensaje en el campo', async (error, mensaje) => {
    // Arrange
    api.crear.mockRejectedValue(error);
    renderizar(<AttributesPanel />);
    await userEvent.type(await screen.findByLabelText('Nuevo atributo'), 'Color');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear atributo' }));

    // Assert
    expect(await screen.findByText(mensaje)).toBeInTheDocument();
  });

  it('agregar valor vacío → error y sin llamar a la API', async () => {
    // Arrange
    renderizar(<AttributesPanel />);
    await screen.findByText('Talla');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar valor a Talla' }));

    // Assert
    expect(await screen.findByText('Ingresa el valor.')).toBeInTheDocument();
    expect(api.agregarValor).not.toHaveBeenCalled();
  });

  it('agregar valor repetido o con error → muestra el mensaje en ese atributo', async () => {
    // Arrange
    api.agregarValor.mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Duplicado.'));
    renderizar(<AttributesPanel />);
    await userEvent.type(await screen.findByLabelText('Nuevo valor de Talla'), 'M');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar valor a Talla' }));

    // Assert
    expect(await screen.findByText('Ya existe con ese nombre.')).toBeInTheDocument();
  });

  it('error que no es de la API al agregar valor → mensaje genérico', async () => {
    // Arrange
    api.agregarValor.mockRejectedValue(new Error('red'));
    renderizar(<AttributesPanel />);
    await userEvent.type(await screen.findByLabelText('Nuevo valor de Talla'), 'XL');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Agregar valor a Talla' }));

    // Assert
    expect(await screen.findByText('No se pudo agregar el valor.')).toBeInTheDocument();
  });
});
