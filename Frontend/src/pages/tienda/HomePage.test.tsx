import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogoApi } from '../../services/api/catalogo';
import { ApiError } from '../../services/http';
import { crearCategoria, crearProductoResumen } from '../../test/fixtures/catalogo';
import { renderizar } from '../../test/renderizar';
import HomePage from './HomePage';

vi.mock('../../services/api/catalogo', () => ({
  catalogoApi: { categorias: vi.fn(), buscarProductos: vi.fn() },
}));
const categorias = vi.mocked(catalogoApi.categorias);
const buscar = vi.mocked(catalogoApi.buscarProductos);

describe('HomePage', () => {
  beforeEach(() => {
    categorias.mockReset();
    buscar.mockReset();
  });

  it('cargando → categorías con estado de carga', () => {
    // Arrange
    categorias.mockReturnValue(new Promise(() => undefined));
    buscar.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<HomePage />);

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando categorías' })).toBeInTheDocument();
  });

  it('datos → categorías enlazan al catálogo filtrado y los recientes se piden con el orden fijo', async () => {
    // Arrange
    categorias.mockResolvedValue([crearCategoria({ idCategoria: 3, nombre: 'Calzado' })]);
    buscar.mockResolvedValue({
      items: [
        crearProductoResumen({
          nombre: 'Tenis urbanos',
          precioMinimo: '459.00',
          precioMaximo: '459.00',
        }),
      ],
      page: 1,
      pageSize: 8,
      total: 1,
    });

    // Act
    renderizar(<HomePage />);

    // Assert
    expect(await screen.findByText('Tenis urbanos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Calzado/ })).toHaveAttribute(
      'href',
      '/catalogo?idCategoria=3',
    );
    expect(buscar).toHaveBeenCalledWith({ page: 1, pageSize: 8, sort: 'fechaCreacion:desc' });
    expect(screen.getByRole('link', { name: 'Ver el catálogo' })).toHaveAttribute(
      'href',
      '/catalogo',
    );
  });

  it('sin categorías ni productos → muestra los EmptyState', async () => {
    // Arrange
    categorias.mockResolvedValue([]);
    buscar.mockResolvedValue({ items: [], page: 1, pageSize: 8, total: 0 });

    // Act
    renderizar(<HomePage />);

    // Assert
    expect(await screen.findByText('Aún no hay categorías')).toBeInTheDocument();
    expect(await screen.findByText('Todavía no hay productos')).toBeInTheDocument();
  });

  it('error en categorías → ErrorState con requestId y Reintentar vuelve a pedirlas', async () => {
    // Arrange
    categorias
      .mockRejectedValueOnce(
        new ApiError(500, 'ERROR_INTERNO', 'Falla de categorías.', [], 'req-3'),
      )
      .mockResolvedValueOnce([crearCategoria({ nombre: 'Calzado' })]);
    buscar.mockResolvedValue({ items: [], page: 1, pageSize: 8, total: 0 });
    renderizar(<HomePage />);
    expect(await screen.findByText('Falla de categorías.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-3')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByRole('link', { name: /Calzado/ })).toBeInTheDocument();
    expect(categorias).toHaveBeenCalledTimes(2);
  });

  it('error en productos recientes → ErrorState y Reintentar vuelve a pedirlos', async () => {
    // Arrange
    categorias.mockResolvedValue([]);
    buscar
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla de productos.', [], 'req-4'))
      .mockResolvedValueOnce({
        items: [crearProductoResumen({ nombre: 'Gorra' })],
        page: 1,
        pageSize: 8,
        total: 1,
      });
    renderizar(<HomePage />);
    expect(await screen.findByText('Falla de productos.')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('Gorra')).toBeInTheDocument();
    expect(buscar).toHaveBeenCalledTimes(2);
  });
});
