import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { direccionesApi } from '../../services/api/direcciones';
import { ApiError } from '../../services/http';
import { crearDireccion } from '../../test/fixtures/direcciones';
import { crearCliente } from '../../test/fixtures/usuarios';
import { crearAuth, renderizar } from '../../test/renderizar';
import MisDireccionesPage from './MisDireccionesPage';

vi.mock('../../services/api/direcciones', () => ({
  direccionesApi: {
    listar: vi.fn(),
    obtener: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    desactivar: vi.fn(),
  },
}));
const api = vi.mocked(direccionesApi);

const casa = crearDireccion();
const oficina = crearDireccion({
  idDireccion: 6,
  alias: 'Oficina',
  linea1: '10a calle 3-45',
  linea2: 'Zona 10',
  municipio: 'Guatemala',
  codigoPostal: '01010',
  referencias: 'Edificio azul',
});

function pagina() {
  return renderizar(<MisDireccionesPage />, {
    auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
  });
}

async function llenarFormulario() {
  await userEvent.type(screen.getByLabelText('Alias'), 'Casa');
  await userEvent.type(screen.getByLabelText('Nombre del destinatario'), 'Ana López');
  await userEvent.type(screen.getByLabelText('Teléfono'), '5555-1234');
  await userEvent.type(screen.getByLabelText('Dirección'), '5a avenida 10-20');
  await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Guatemala');
  await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Mixco');
}

describe('MisDireccionesPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    pagina();

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando direcciones' })).toBeInTheDocument();
  });

  it('sin direcciones → EmptyState con acción para agregar', async () => {
    // Arrange
    api.listar.mockResolvedValue([]);

    // Act
    pagina();

    // Assert
    expect(await screen.findByText('Aún no tienes direcciones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar dirección' })).toBeInTheDocument();
  });

  it('error al cargar → ErrorState con requestId, y Reintentar vuelve a llamar a la API', async () => {
    // Arrange
    api.listar
      .mockRejectedValueOnce(
        new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-55'),
      )
      .mockResolvedValueOnce([casa]);
    pagina();
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-55')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('Casa')).toBeInTheDocument();
    expect(api.listar).toHaveBeenCalledTimes(2);
  });

  it('con direcciones → las lista con sus datos', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa, oficina]);

    // Act
    pagina();

    // Assert
    expect(await screen.findByText('Oficina')).toBeInTheDocument();
    expect(screen.getByText('Casa')).toBeInTheDocument();
    expect(screen.getByText(/10a calle 3-45, Zona 10/)).toBeInTheDocument();
    expect(screen.getByText(/Guatemala, Guatemala 01010/)).toBeInTheDocument();
    expect(screen.getByText('Edificio azul')).toBeInTheDocument();
  });

  it('Nueva dirección → abre el formulario de alta', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa]);
    pagina();
    await screen.findByText('Casa');

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Nueva dirección/ }));

    // Assert
    expect(screen.getByRole('region', { name: 'Nueva dirección' })).toBeInTheDocument();
    expect(screen.getByLabelText('Alias')).toHaveValue('');
  });

  it('guardar una dirección nueva → la crea con los datos exactos y avisa', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa]);
    api.crear.mockResolvedValue(casa);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: /Nueva dirección/ }));
    await llenarFormulario();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    // Assert
    expect(await screen.findByText('Dirección agregada.')).toBeInTheDocument();
    expect(api.crear).toHaveBeenCalledWith({
      alias: 'Casa',
      nombreDestinatario: 'Ana López',
      telefono: '5555-1234',
      linea1: '5a avenida 10-20',
      departamento: 'Guatemala',
      municipio: 'Mixco',
    });
    expect(screen.queryByRole('region', { name: 'Nueva dirección' })).not.toBeInTheDocument();
  });

  it('formulario vacío → muestra errores por campo y no llama a la API', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa]);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: /Nueva dirección/ }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    // Assert
    expect(await screen.findByText('Ingresa un alias.')).toBeInTheDocument();
    expect(screen.getByLabelText('Alias')).toHaveAttribute('aria-invalid', 'true');
    expect(api.crear).not.toHaveBeenCalled();
  });

  it('el backend rechaza el alias (details) → el mensaje queda en su campo', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa]);
    api.crear.mockRejectedValue(
      new ApiError(400, 'VALIDACION', 'Datos inválidos', [
        { field: 'alias', message: 'Ya tienes una dirección con ese alias.' },
      ]),
    );
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: /Nueva dirección/ }));
    await llenarFormulario();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    // Assert
    expect(await screen.findByText('Ya tienes una dirección con ese alias.')).toBeInTheDocument();
    expect(screen.getByLabelText('Alias')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Dirección agregada.')).not.toBeInTheDocument();
  });

  it('Editar → abre el formulario con los datos y guardar actualiza esa dirección', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa, oficina]);
    api.actualizar.mockResolvedValue(oficina);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Oficina' }));
    const alias = screen.getByLabelText('Alias');
    expect(alias).toHaveValue('Oficina');
    await userEvent.clear(alias);
    await userEvent.type(alias, 'Trabajo');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar dirección' }));

    // Assert
    expect(await screen.findByText('Dirección actualizada.')).toBeInTheDocument();
    expect(api.actualizar).toHaveBeenCalledWith(
      6,
      expect.objectContaining({
        alias: 'Trabajo',
        linea1: '10a calle 3-45',
        linea2: 'Zona 10',
        codigoPostal: '01010',
        referencias: 'Edificio azul',
      }),
    );
  });

  it('Cancelar el formulario → lo cierra sin llamar a la API', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa]);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Casa' }));
    const formulario = screen.getByRole('region', { name: 'Editar dirección' });

    // Act
    await userEvent.click(within(formulario).getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('region', { name: 'Editar dirección' })).not.toBeInTheDocument();
    expect(api.actualizar).not.toHaveBeenCalled();
  });

  it('Eliminar → pide confirmación con el alias antes de llamar a la API', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa]);
    pagina();
    await screen.findByText('Casa');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Casa' }));

    // Assert
    const dialogo = screen.getByRole('dialog', { name: '¿Eliminar esta dirección?' });
    expect(within(dialogo).getByText(/Se eliminará "Casa"/)).toBeInTheDocument();
    expect(api.desactivar).not.toHaveBeenCalled();
  });

  it('confirmar la baja → desactiva la dirección, avisa y cierra el diálogo', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa]);
    api.desactivar.mockResolvedValue(undefined);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Casa' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    // Assert
    expect(await screen.findByText('Dirección eliminada.')).toBeInTheDocument();
    expect(api.desactivar).toHaveBeenCalledWith(5);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancelar la baja → no llama a la API', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa]);
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Casa' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.desactivar).not.toHaveBeenCalled();
  });

  it('la baja falla → muestra el aviso de error con el requestId', async () => {
    // Arrange
    api.listar.mockResolvedValue([casa]);
    api.desactivar.mockRejectedValue(
      new ApiError(404, 'NO_ENCONTRADO', 'La dirección no existe.', [], 'req-8'),
    );
    pagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Casa' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('La dirección no existe.');
    expect(screen.getByText('Referencia: req-8')).toBeInTheDocument();
  });
});
