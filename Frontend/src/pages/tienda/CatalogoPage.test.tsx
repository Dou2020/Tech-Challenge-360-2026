import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogoApi } from '../../services/api/catalogo';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { ProductoResumen } from '../../types/catalogo';
import CatalogoPage from './CatalogoPage';

vi.mock('../../services/api/catalogo', () => ({
  catalogoApi: { categorias: vi.fn(), buscarProductos: vi.fn() },
}));

const categorias = vi.mocked(catalogoApi.categorias);
const buscar = vi.mocked(catalogoApi.buscarProductos);

const tenis: ProductoResumen = {
  idProducto: 5,
  nombre: 'Tenis urbanos',
  descripcion: null,
  idCategoria: 3,
  categoria: 'Calzado',
  precioMinimo: '459.00',
  precioMaximo: '459.00',
  disponible: true,
  imagenPrincipal: null,
  fechaCreacion: '2026-11-01T15:30:00.000Z',
};

describe('CatalogoPage', () => {
  beforeEach(() => {
    categorias
      .mockReset()
      .mockResolvedValue([
        { idCategoria: 3, nombre: 'Calzado', descripcion: null, cantidadProductos: 4 },
      ]);
    buscar.mockReset();
  });

  it('envía a la API los filtros, el orden y la página de la URL', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [tenis], page: 2, pageSize: 12, total: 30 });

    // Act
    renderizar(<CatalogoPage />, {
      ruta: '/catalogo?q=tenis&idCategoria=3&precioMin=100&precioMax=900&disponible=true&sort=precio:desc&page=2',
    });

    // Assert
    expect(await screen.findByText('Tenis urbanos')).toBeInTheDocument();
    expect(buscar).toHaveBeenCalledWith({
      q: 'tenis',
      idCategoria: '3',
      precioMin: '100',
      precioMax: '900',
      disponible: 'true',
      sort: 'precio:desc',
      page: 2,
      pageSize: 12,
    });
    expect(screen.getByRole('searchbox', { name: 'Buscar en el catálogo' })).toHaveValue('tenis');
    expect(screen.getByText('Mostrando 13–24 de 30')).toBeInTheDocument();
  });

  it('al cambiar la categoría actualiza la URL y vuelve a consultar', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [tenis], page: 1, pageSize: 12, total: 1 });
    const { router } = renderizar(<CatalogoPage />, { ruta: '/catalogo?page=3' });
    await screen.findByText('Tenis urbanos');
    await screen.findByRole('option', { name: 'Calzado' });

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Calzado');

    // Assert
    expect(router.state.location.search).toBe('?idCategoria=3');
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ idCategoria: '3', page: 1 }));
  });

  it('sin resultados muestra el estado vacío', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [], page: 1, pageSize: 12, total: 0 });

    // Act
    renderizar(<CatalogoPage />, { ruta: '/catalogo?q=zzz' });

    // Assert
    expect(await screen.findByText('No encontramos productos')).toBeInTheDocument();
  });

  it('si falla muestra el error con su referencia y permite reintentar', async () => {
    // Arrange
    buscar
      .mockRejectedValueOnce(
        new ApiError(500, 'ERROR_INTERNO', 'Error del servidor.', [], 'req-123'),
      )
      .mockResolvedValueOnce({ items: [tenis], page: 1, pageSize: 12, total: 1 });
    renderizar(<CatalogoPage />, { ruta: '/catalogo' });

    // Act
    const alerta = await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(alerta).toHaveTextContent('Referencia: req-123');
    expect(await screen.findByText('Tenis urbanos')).toBeInTheDocument();
  });

  it('cargando → muestra los marcadores de carga', () => {
    // Arrange
    buscar.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<CatalogoPage />, { ruta: '/catalogo' });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando productos' })).toBeInTheDocument();
  });

  it('cambiar el orden → actualiza sort en la URL y vuelve a la página 1', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [tenis], page: 3, pageSize: 12, total: 40 });
    const { router } = renderizar(<CatalogoPage />, { ruta: '/catalogo?page=3' });
    await screen.findByText('Tenis urbanos');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Ordenar por'), 'Precio: menor a mayor');

    // Assert
    expect(router.state.location.search).toBe('?sort=precio%3Aasc');
    expect(buscar).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'precio:asc', page: 1 }),
    );
  });

  it('buscar un texto → pone q en la URL y vuelve a la página 1', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [tenis], page: 2, pageSize: 12, total: 40 });
    const { router } = renderizar(<CatalogoPage />, { ruta: '/catalogo?page=2' });
    await screen.findByText('Tenis urbanos');

    // Act
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar en el catálogo' }),
      'gorra{Enter}',
    );

    // Assert
    expect(router.state.location.search).toBe('?q=gorra');
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'gorra', page: 1 }));
  });

  it('elegir disponibilidad → pone disponible en la URL', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [tenis], page: 1, pageSize: 12, total: 1 });
    const { router } = renderizar(<CatalogoPage />, { ruta: '/catalogo' });
    await screen.findByText('Tenis urbanos');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Disponibilidad'), 'Solo disponibles');

    // Assert
    expect(router.state.location.search).toBe('?disponible=true');
  });

  it('aplicar un rango de precio → lo pone en la URL y lo manda a la API', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [tenis], page: 1, pageSize: 12, total: 1 });
    const { router } = renderizar(<CatalogoPage />, { ruta: '/catalogo?page=2' });
    await screen.findByText('Tenis urbanos');
    await userEvent.type(screen.getByLabelText('Precio mín.'), '100');
    await userEvent.type(screen.getByLabelText('Precio máx.'), '500');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar precio' }));

    // Assert
    expect(router.state.location.search).toBe('?precioMin=100&precioMax=500');
    expect(buscar).toHaveBeenLastCalledWith(
      expect.objectContaining({ precioMin: '100', precioMax: '500', page: 1 }),
    );
  });

  it('precio mínimo mayor que el máximo → muestra la advertencia', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [tenis], page: 1, pageSize: 12, total: 1 });

    // Act
    renderizar(<CatalogoPage />, { ruta: '/catalogo?precioMin=900&precioMax=100' });

    // Assert
    expect(
      await screen.findByText('El precio mínimo no puede superar al máximo.'),
    ).toBeInTheDocument();
  });

  it('Limpiar filtros → quita los filtros de la URL', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [tenis], page: 1, pageSize: 12, total: 1 });
    const { router } = renderizar(<CatalogoPage />, { ruta: '/catalogo?q=tenis&idCategoria=3' });
    await screen.findByText('Tenis urbanos');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    // Assert
    expect(router.state.location.search).toBe('');
    expect(buscar).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 12,
      sort: 'fechaCreacion:desc',
    });
  });

  it('sin resultados con filtros → el vacío ofrece limpiar los filtros', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [], page: 1, pageSize: 12, total: 0 });

    // Act
    renderizar(<CatalogoPage />, { ruta: '/catalogo?q=zzz' });

    // Assert
    expect(await screen.findByText('No encontramos productos')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Limpiar filtros' })).toHaveLength(2);
  });

  it('paginación → "siguiente" pide la página 3 y el tamaño pide la página 1', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [tenis], page: 2, pageSize: 12, total: 30 });
    const { router } = renderizar(<CatalogoPage />, { ruta: '/catalogo?page=2' });
    await screen.findByText('Tenis urbanos');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    // Assert
    expect(router.state.location.search).toBe('?page=3');
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }));
  });

  it('cambiar el tamaño de página → size en la URL y vuelve a la página 1', async () => {
    // Arrange
    buscar.mockResolvedValue({ items: [tenis], page: 2, pageSize: 12, total: 30 });
    const { router } = renderizar(<CatalogoPage />, { ruta: '/catalogo?page=2' });
    await screen.findByText('Tenis urbanos');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Por página'), '24');

    // Assert
    expect(router.state.location.search).toBe('?size=24');
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 24, page: 1 }));
  });
});
