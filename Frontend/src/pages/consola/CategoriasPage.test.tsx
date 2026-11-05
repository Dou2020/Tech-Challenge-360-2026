import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { categoriasApi } from '../../services/api/gestion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { CategoriaGestion } from '../../types/gestion';
import CategoriasPage from './CategoriasPage';

vi.mock('../../services/api/gestion', () => ({
  categoriasApi: {
    listar: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
  },
}));
const api = vi.mocked(categoriasApi);

const camisetas: CategoriaGestion = {
  idCategoria: 1,
  nombre: 'Camisetas',
  descripcion: 'Ropa superior',
  activo: true,
  cantidadProductos: 3,
  cantidadCupones: 0,
};

describe('CategoriasPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.listar.mockResolvedValue({ items: [camisetas], page: 1, pageSize: 20, total: 1 });
  });

  it('envía filtros, orden y página de la URL', async () => {
    // Arrange / Act
    renderizar(<CategoriasPage />, {
      ruta: '/consola/categorias?q=cam&activo=true&sort=cantidadProductos:desc',
    });

    // Assert
    expect(await screen.findByText('Camisetas')).toBeInTheDocument();
    expect(api.listar).toHaveBeenCalledWith({
      q: 'cam',
      activo: 'true',
      sort: 'cantidadProductos:desc',
      page: 1,
      pageSize: 20,
    });
  });

  it('un nombre repetido (409 DUPLICADO) se marca en el campo nombre', async () => {
    // Arrange
    api.crear.mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Duplicado.'));
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva categoría' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Camisetas');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    // Assert
    expect(await screen.findByText('Ya existe una categoría con ese nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
  });

  it('crea una categoría y refresca la lista', async () => {
    // Arrange
    api.crear.mockResolvedValue({ ...camisetas, idCategoria: 2, nombre: 'Gorras' });
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva categoría' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Gorras');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    // Assert
    await waitFor(() => expect(api.crear).toHaveBeenCalledWith({ nombre: 'Gorras' }));
    expect(await screen.findByText('Categoría "Gorras" creada.')).toBeInTheDocument();
    await waitFor(() => expect(api.listar).toHaveBeenCalledTimes(2));
  });

  it('eliminar una categoría en uso (409 EN_USO) explica que se desactive', async () => {
    // Arrange
    api.eliminar.mockRejectedValue(new ApiError(409, 'EN_USO', 'En uso.'));
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Camisetas' }));

    // Act
    const dialogo = screen.getByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Desactívala en su lugar');
  });

  it('desactivar pide confirmación y envía el nuevo estado', async () => {
    // Arrange
    api.cambiarEstado.mockResolvedValue({ ...camisetas, activo: false });
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar Camisetas' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    await waitFor(() => expect(api.cambiarEstado).toHaveBeenCalledWith(1, false));
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });

    // Assert
    expect(
      screen.getByRole('status', { name: 'Cargando lista de categorías' }),
    ).toBeInTheDocument();
  });

  it('error → ErrorState con requestId y Reintentar', async () => {
    // Arrange
    api.listar
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-91'))
      .mockResolvedValueOnce({ items: [camisetas], page: 1, pageSize: 20, total: 1 });
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    expect(await screen.findByText('Referencia: req-91')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('Camisetas')).toBeInTheDocument();
  });

  it('sin categorías ni filtros → vacío simple; con filtros → ofrece limpiar', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    // Act
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });

    // Assert
    expect(await screen.findByText('Aún no hay categorías')).toBeInTheDocument();
  });

  it('sin categorías con filtros → "Limpiar filtros" quita la URL', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const { router } = renderizar(<CategoriasPage />, { ruta: '/consola/categorias?q=zzz' });
    await userEvent.click(await screen.findByRole('button', { name: 'Limpiar filtros' }));

    // Assert
    expect(router.state.location.search).toBe('');
  });

  it('cambiar el filtro de estado → activo en la URL y vuelve a la página 1', async () => {
    // Arrange
    const { router } = renderizar(<CategoriasPage />, { ruta: '/consola/categorias?page=2' });
    await screen.findByText('Camisetas');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'Inactivas');

    // Assert
    expect(router.state.location.search).toBe('?activo=false');
    expect(api.listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ activo: 'false', page: 1 }),
    );
  });

  it('Nueva categoría → abre el panel y deshabilita el botón', async () => {
    // Arrange
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await screen.findByText('Camisetas');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Nueva categoría' }));

    // Assert
    expect(screen.getByRole('region', { name: 'Nueva categoría' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva categoría' })).toBeDisabled();
  });

  it('Editar → precarga el panel y guardar actualiza esa categoría', async () => {
    // Arrange
    api.actualizar.mockResolvedValue({ ...camisetas, nombre: 'Playeras' });
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Camisetas' }));
    const nombre = screen.getByLabelText('Nombre');
    expect(nombre).toHaveValue('Camisetas');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Playeras');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText('Categoría "Playeras" actualizada.')).toBeInTheDocument();
    expect(api.actualizar).toHaveBeenCalledWith(1, {
      nombre: 'Playeras',
      descripcion: 'Ropa superior',
    });
  });

  it('Cancelar el panel → lo cierra sin llamar a la API', async () => {
    // Arrange
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Camisetas' }));
    const panel = screen.getByRole('region', { name: 'Editar Camisetas' });

    // Act
    await userEvent.click(within(panel).getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('region', { name: 'Editar Camisetas' })).not.toBeInTheDocument();
    expect(api.actualizar).not.toHaveBeenCalled();
  });

  it('activar una categoría inactiva → pide confirmación y envía activo true', async () => {
    // Arrange
    api.listar.mockResolvedValue({
      items: [{ ...camisetas, activo: false }],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    api.cambiarEstado.mockResolvedValue(camisetas);
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Activar Camisetas' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    expect(await screen.findByText('"Camisetas" activada.')).toBeInTheDocument();
    expect(api.cambiarEstado).toHaveBeenCalledWith(1, true);
  });

  it('desactivar con éxito → avisa que los productos se ocultan', async () => {
    // Arrange
    api.cambiarEstado.mockResolvedValue({ ...camisetas, activo: false });
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar Camisetas' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    expect(await screen.findByText(/sus productos se ocultan de la tienda/)).toBeInTheDocument();
  });

  it('error al cambiar el estado → aviso con requestId y se cierra el diálogo', async () => {
    // Arrange
    api.cambiarEstado.mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-92'),
    );
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar Camisetas' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-92')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('eliminar con éxito → avisa y llama a eliminar', async () => {
    // Arrange
    api.eliminar.mockResolvedValue(undefined);
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Camisetas' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    // Assert
    expect(await screen.findByText('Categoría "Camisetas" eliminada.')).toBeInTheDocument();
    expect(api.eliminar).toHaveBeenCalledWith(1);
  });

  it('eliminar con un error distinto de EN_USO → mensaje del backend', async () => {
    // Arrange
    api.eliminar.mockRejectedValue(new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'));
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Camisetas' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
  });

  it('Cancelar la confirmación → no llama a la API', async () => {
    // Arrange
    renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar Camisetas' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.eliminar).not.toHaveBeenCalled();
  });

  it('buscar por nombre → q en la URL', async () => {
    // Arrange
    const { router } = renderizar(<CategoriasPage />, { ruta: '/consola/categorias' });
    await screen.findByText('Camisetas');

    // Act
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar categoría por nombre' }),
      'cal{Enter}',
    );

    // Assert
    expect(router.state.location.search).toBe('?q=cal');
  });
});
