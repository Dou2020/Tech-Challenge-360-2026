import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sucursalesApi } from '../../services/api/sucursales';
import { ApiError } from '../../services/http';
import { crearSucursalGestion } from '../../test/fixtures/sucursales';
import { renderizar } from '../../test/renderizar';
import SucursalesPage from './SucursalesPage';

vi.mock('../../services/api/sucursales', () => ({
  sucursalesApi: {
    listar: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
  },
  sucursalesPublicasApi: { listar: vi.fn() },
}));
const api = vi.mocked(sucursalesApi);

describe('SucursalesPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.listar.mockResolvedValue({
      items: [crearSucursalGestion()],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it('envía filtros, orden y página de la URL y muestra la fila', async () => {
    // Arrange / Act
    renderizar(<SucursalesPage />, {
      ruta: '/consola/sucursales?q=zona&activo=true&sort=cantidadPedidos:desc',
    });

    // Assert
    expect(await screen.findByText('Zona 10')).toBeInTheDocument();
    expect(api.listar).toHaveBeenCalledWith({
      q: 'zona',
      activo: 'true',
      sort: 'cantidadPedidos:desc',
      page: 1,
      pageSize: 20,
    });
  });

  it('eliminar una sucursal con pedidos (409 EN_USO) → sugiere desactivarla', async () => {
    // Arrange
    api.eliminar.mockRejectedValue(new ApiError(409, 'EN_USO', 'En uso.'));
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Zona 10' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    // Assert
    expect(await screen.findByText(/Desactívala en su lugar/)).toBeInTheDocument();
  });

  it('un nombre repetido (409 DUPLICADO) se marca en el campo nombre', async () => {
    // Arrange
    api.crear.mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Duplicado.'));
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva sucursal' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Zona 10');
    await userEvent.type(screen.getByLabelText('Teléfono'), '22334455');
    await userEvent.type(screen.getByLabelText('Dirección'), '6a avenida 12-34');
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Guatemala');
    await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Mixco');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    expect(await screen.findByText('Ya existe una sucursal con ese nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
  });

  const pagina = (items: ReturnType<typeof crearSucursalGestion>[]) => ({
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
  });

  async function llenarObligatorios() {
    await userEvent.type(screen.getByLabelText('Nombre'), 'Mixco');
    await userEvent.type(screen.getByLabelText('Teléfono'), '22334455');
    await userEvent.type(screen.getByLabelText('Dirección'), 'Calzada Roosevelt 1-23');
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Guatemala');
    await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Mixco');
  }

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });

    // Assert
    expect(
      screen.getByRole('status', { name: 'Cargando lista de sucursales' }),
    ).toBeInTheDocument();
  });

  it('error → ErrorState con requestId y Reintentar vuelve a pedir la lista', async () => {
    // Arrange
    api.listar
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-31'))
      .mockResolvedValueOnce(pagina([crearSucursalGestion()]));
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    expect(await screen.findByText('Referencia: req-31')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('Zona 10')).toBeInTheDocument();
    expect(api.listar).toHaveBeenCalledTimes(2);
  });

  it('sin sucursales ni filtros → "Aún no hay sucursales"', async () => {
    // Arrange
    api.listar.mockResolvedValue(pagina([]));

    // Act
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });

    // Assert
    expect(await screen.findByText('Aún no hay sucursales')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('sin resultados con filtros → "Limpiar filtros" quita los filtros de la URL', async () => {
    // Arrange
    api.listar.mockResolvedValue(pagina([]));
    const { router } = renderizar(<SucursalesPage />, {
      ruta: '/consola/sucursales?q=zzz&activo=false',
    });
    await screen.findByText('No hay sucursales con esos filtros');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    // Assert
    expect(router.state.location.search).toBe('');
  });

  it('muestra los datos de la fila: ubicación, teléfono, pedidos y estado', async () => {
    // Arrange
    api.listar.mockResolvedValue(
      pagina([
        crearSucursalGestion({ cantidadPedidos: 7 }),
        crearSucursalGestion({ idSucursal: 4, nombre: 'Mixco', activo: false }),
      ]),
    );

    // Act
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });

    // Assert
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getAllByText('Guatemala, Guatemala').length).toBe(2);
    expect(within(tabla).getByText('7')).toBeInTheDocument();
    expect(within(tabla).getByText('Activa')).toBeInTheDocument();
    expect(within(tabla).getByText('Inactiva')).toBeInTheDocument();
    expect(within(tabla).getByRole('button', { name: 'Desactivar Zona 10' })).toBeInTheDocument();
    expect(within(tabla).getByRole('button', { name: 'Activar Mixco' })).toBeInTheDocument();
  });

  it('clic en una columna ordenable → pone sort en la URL y vuelve a pedir la lista', async () => {
    // Arrange
    const { router } = renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await screen.findByText('Zona 10');

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Municipio/ }));

    // Assert
    expect(new URLSearchParams(router.state.location.search).get('sort')).toBe('municipio:asc');
    await vi.waitFor(() =>
      expect(api.listar).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'municipio:asc', page: 1 }),
      ),
    );
  });

  it('crear con éxito → llama a la API con los datos, cierra el panel y avisa', async () => {
    // Arrange
    api.crear.mockResolvedValue(crearSucursalGestion({ idSucursal: 9, nombre: 'Mixco' }));
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva sucursal' }));
    await llenarObligatorios();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    expect(await screen.findByText('Sucursal "Mixco" creada.')).toBeInTheDocument();
    expect(api.crear).toHaveBeenCalledWith({
      nombre: 'Mixco',
      telefono: '22334455',
      linea1: 'Calzada Roosevelt 1-23',
      departamento: 'Guatemala',
      municipio: 'Mixco',
    });
    expect(screen.queryByRole('region', { name: 'Nueva sucursal' })).not.toBeInTheDocument();
  });

  it('editar con éxito → precarga la sucursal, llama a actualizar y avisa', async () => {
    // Arrange
    api.actualizar.mockResolvedValue(crearSucursalGestion({ nombre: 'Zona 10 Norte' }));
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Zona 10' }));
    const nombre = screen.getByLabelText('Nombre');
    expect(nombre).toHaveValue('Zona 10');
    await userEvent.type(nombre, ' Norte');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText('Sucursal "Zona 10 Norte" actualizada.')).toBeInTheDocument();
    expect(api.actualizar).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ nombre: 'Zona 10 Norte', telefono: '22334455' }),
    );
  });

  it('desactivar → pide confirmación y manda activo: false', async () => {
    // Arrange
    api.cambiarEstado.mockResolvedValue(crearSucursalGestion({ activo: false }));
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar Zona 10' }));
    expect(screen.getByRole('dialog', { name: '¿Desactivar "Zona 10"?' })).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    // Assert
    expect(
      await screen.findByText('"Zona 10" desactivada: ya no se ofrece para retiro.'),
    ).toBeInTheDocument();
    expect(api.cambiarEstado).toHaveBeenCalledWith(3, false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('activar una sucursal inactiva → manda activo: true', async () => {
    // Arrange
    api.listar.mockResolvedValue(pagina([crearSucursalGestion({ activo: false })]));
    api.cambiarEstado.mockResolvedValue(crearSucursalGestion());
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await userEvent.click(await screen.findByRole('button', { name: 'Activar Zona 10' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    // Assert
    expect(await screen.findByText('"Zona 10" activada.')).toBeInTheDocument();
    expect(api.cambiarEstado).toHaveBeenCalledWith(3, true);
  });

  it('el cambio de estado falla → aviso de error con su requestId y se cierra el diálogo', async () => {
    // Arrange
    api.cambiarEstado.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'No se pudo cambiar.', [], 'req-32'),
    );
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar Zona 10' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cambiar.');
    expect(screen.getByText('Referencia: req-32')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancelar el diálogo → no llama a la API', async () => {
    // Arrange
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar Zona 10' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.cambiarEstado).not.toHaveBeenCalled();
  });

  it('eliminar con éxito → llama a la API y avisa', async () => {
    // Arrange
    api.eliminar.mockResolvedValue(undefined);
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Zona 10' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    // Assert
    expect(await screen.findByText('Sucursal "Zona 10" eliminada.')).toBeInTheDocument();
    expect(api.eliminar).toHaveBeenCalledWith(3);
  });

  it('eliminar falla con un error distinto de EN_USO → muestra el mensaje del backend', async () => {
    // Arrange
    api.eliminar.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla al eliminar.', [], 'req-33'),
    );
    renderizar(<SucursalesPage />, { ruta: '/consola/sucursales' });
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Zona 10' }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Falla al eliminar.');
    expect(screen.queryByText(/Desactívala en su lugar/)).not.toBeInTheDocument();
    expect(screen.getByText('Referencia: req-33')).toBeInTheDocument();
  });
});
