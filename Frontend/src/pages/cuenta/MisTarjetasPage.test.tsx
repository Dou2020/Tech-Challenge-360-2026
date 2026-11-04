import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tarjetasApi } from '../../services/api/tarjetas';
import { ApiError } from '../../services/http';
import { crearTarjeta } from '../../test/fixtures/tarjetas';
import { crearCliente } from '../../test/fixtures/usuarios';
import { crearAuth, renderizar } from '../../test/renderizar';
import MisTarjetasPage from './MisTarjetasPage';

vi.mock('../../services/api/tarjetas', () => ({
  tarjetasApi: {
    listar: vi.fn(),
    crear: vi.fn(),
    marcarPredeterminada: vi.fn(),
    eliminar: vi.fn(),
  },
}));
const api = vi.mocked(tarjetasApi);

const visa = crearTarjeta();
const master = crearTarjeta({
  idTarjeta: 4,
  marca: 'MASTERCARD',
  tipo: 'DEBITO',
  ultimos4: '1111',
  predeterminada: false,
});

const pagina = () =>
  renderizar(<MisTarjetasPage />, {
    auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
  });

describe('MisTarjetasPage', () => {
  beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

  it('lista las tarjetas y marca la predeterminada', async () => {
    // Arrange
    api.listar.mockResolvedValue([visa, master]);

    // Act
    pagina();

    // Assert
    expect(await screen.findByText('VISA · Crédito •••• 4242')).toBeInTheDocument();
    expect(screen.getByText('Mastercard · Débito •••• 1111')).toBeInTheDocument();
    expect(screen.getByText('Predeterminada')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Marcar como predeterminada/ })).toHaveLength(1);
  });

  it('sin tarjetas → estado vacío', async () => {
    // Arrange
    api.listar.mockResolvedValue([]);

    // Act
    pagina();

    // Assert
    expect(await screen.findByText('Aún no tienes tarjetas guardadas')).toBeInTheDocument();
  });

  it('error al cargar → ErrorState con reintentar y referencia', async () => {
    // Arrange
    api.listar.mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falló.', [], 'req-9'));
    api.listar.mockResolvedValue([visa]);
    pagina();
    expect(await screen.findByText(/req-9/)).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Reintentar/ }));

    // Assert
    expect(await screen.findByText('VISA · Crédito •••• 4242')).toBeInTheDocument();
  });

  it('marcar como predeterminada → llama a la API con el id', async () => {
    // Arrange
    api.listar.mockResolvedValue([visa, master]);
    api.marcarPredeterminada.mockResolvedValue({ ...master, predeterminada: true });
    pagina();

    // Act
    await userEvent.click(
      await screen.findByRole('button', { name: /Marcar como predeterminada/ }),
    );

    // Assert
    await waitFor(() => expect(api.marcarPredeterminada).toHaveBeenCalledWith(4));
    expect(await screen.findByText('Tarjeta marcada como predeterminada.')).toBeInTheDocument();
  });

  it('eliminar pide confirmación y borra la tarjeta', async () => {
    // Arrange
    api.listar.mockResolvedValue([visa, master]);
    api.eliminar.mockResolvedValue(undefined);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: /Eliminar Mastercard/ }));

    // Act
    const dialogo = await screen.findByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    // Assert
    await waitFor(() => expect(api.eliminar).toHaveBeenCalledWith(4));
  });

  it('agregar una tarjeta rechazada (402) muestra el mensaje de la API', async () => {
    // Arrange
    api.listar.mockResolvedValue([visa]);
    api.crear.mockRejectedValue(new ApiError(402, 'PAGO_RECHAZADO', 'Tarjeta rechazada.'));
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar tarjeta' }));
    await userEvent.type(screen.getByLabelText('Titular de la tarjeta'), 'Ana López');
    await userEvent.type(screen.getByLabelText('Últimos 4 dígitos de la tarjeta'), '0000');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de tarjeta'), 'CREDITO');
    await userEvent.selectOptions(screen.getByLabelText('Marca'), 'VISA');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar tarjeta' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Tarjeta rechazada.');
    expect(api.crear).toHaveBeenCalledWith({
      titular: 'Ana López',
      ultimos4: '0000',
      tipo: 'CREDITO',
      marca: 'VISA',
      predeterminada: false,
    });
  });

  it('marcar falla → aviso de error con el mensaje y el requestId', async () => {
    // Arrange
    api.listar.mockResolvedValue([visa, master]);
    api.marcarPredeterminada.mockRejectedValue(
      new ApiError(404, 'NO_ENCONTRADO', 'La tarjeta no existe.', [], 'req-77'),
    );
    pagina();

    // Act
    await userEvent.click(
      await screen.findByRole('button', { name: /Marcar como predeterminada/ }),
    );

    // Assert
    expect(await screen.findByText('La tarjeta no existe.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-77')).toBeInTheDocument();
  });

  it('eliminar falla → aviso de error con el requestId y el diálogo se cierra', async () => {
    // Arrange
    api.listar.mockResolvedValue([visa, master]);
    api.eliminar.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'No se pudo borrar.', [], 'req-78'),
    );
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: /Eliminar Mastercard/ }));
    const dialogo = await screen.findByRole('dialog');

    // Act
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    // Assert
    expect(await screen.findByText('No se pudo borrar.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-78')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancelar el diálogo de eliminar → no llama a la API y cierra el diálogo', async () => {
    // Arrange
    api.listar.mockResolvedValue([visa, master]);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: /Eliminar Mastercard/ }));
    const dialogo = await screen.findByRole('dialog');

    // Act
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    // Assert
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.eliminar).not.toHaveBeenCalled();
  });

  it('cancelar el formulario de alta → lo cierra y no llama a la API', async () => {
    // Arrange
    api.listar.mockResolvedValue([visa]);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar tarjeta' }));
    const formulario = screen.getByRole('region', { name: 'Agregar tarjeta' });

    // Act
    await userEvent.click(within(formulario).getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('region', { name: 'Agregar tarjeta' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar tarjeta' })).toBeInTheDocument();
    expect(api.crear).not.toHaveBeenCalled();
  });

  it('alta exitosa → cierra el formulario, avisa y vuelve a pedir la lista', async () => {
    // Arrange
    api.listar.mockResolvedValue([visa]);
    api.crear.mockResolvedValue(master);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar tarjeta' }));
    await userEvent.type(screen.getByLabelText('Titular de la tarjeta'), 'Luis Pérez');
    await userEvent.type(screen.getByLabelText('Últimos 4 dígitos de la tarjeta'), '1111');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de tarjeta'), 'DEBITO');
    await userEvent.selectOptions(screen.getByLabelText('Marca'), 'MASTERCARD');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar tarjeta' }));

    // Assert
    expect(await screen.findByText('Tarjeta agregada.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Agregar tarjeta' })).not.toBeInTheDocument();
    await waitFor(() => expect(api.listar).toHaveBeenCalledTimes(2));
  });

  it('sin tarjetas → el botón del estado vacío abre el formulario de alta', async () => {
    // Arrange
    api.listar.mockResolvedValue([]);
    pagina();
    await screen.findByText('Aún no tienes tarjetas guardadas');

    // Act
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar tarjeta' })[1]!);

    // Assert
    expect(screen.getByRole('region', { name: 'Agregar tarjeta' })).toBeInTheDocument();
    expect(screen.queryByText('Aún no tienes tarjetas guardadas')).not.toBeInTheDocument();
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    pagina();

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando tarjetas' })).toBeInTheDocument();
  });
});
