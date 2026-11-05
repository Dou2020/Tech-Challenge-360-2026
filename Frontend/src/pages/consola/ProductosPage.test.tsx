import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { categoriasApi, productosApi } from '../../services/api/gestion';
import { userEvent } from '@testing-library/user-event';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { ProductoListado } from '../../types/gestion';
import ProductosPage from './ProductosPage';

vi.mock('../../services/api/gestion', () => ({
  productosApi: { listar: vi.fn() },
  categoriasApi: { listar: vi.fn() },
}));

const producto: ProductoListado = {
  idProducto: 8,
  nombre: 'Sudadero con capucha',
  idCategoria: 1,
  categoria: 'Camisetas',
  activo: false,
  cantidadVariantes: 2,
  cantidadVariantesActivas: 1,
  precioMinimo: '249.00',
  precioMaximo: '279.00',
  existenciaFisica: 10,
  existenciaReservada: 2,
  existenciaDisponible: 8,
  imagenPrincipal: 'https://img.test/s.jpg',
  fechaCreacion: '2026-11-01T15:30:00.000Z',
  fechaModificacion: null,
};

describe('ProductosPage', () => {
  beforeEach(() => {
    vi.mocked(productosApi.listar).mockReset();
    vi.mocked(categoriasApi.listar).mockResolvedValue({
      items: [
        {
          idCategoria: 1,
          nombre: 'Camisetas',
          descripcion: null,
          activo: false,
          cantidadProductos: 1,
          cantidadCupones: 0,
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
    });
  });

  it('lista con imagen, rango de precio y existencias; incluye categorías inactivas en el filtro', async () => {
    // Arrange
    vi.mocked(productosApi.listar).mockResolvedValue({
      items: [producto],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    // Act
    renderizar(<ProductosPage />, {
      ruta: '/consola/productos?q=sud&idCategoria=1&activo=false&sort=precio:asc',
    });

    // Assert
    const tabla = await screen.findByRole('table', { name: 'Lista de productos' });
    expect(productosApi.listar).toHaveBeenCalledWith({
      q: 'sud',
      idCategoria: '1',
      activo: 'false',
      sort: 'precio:asc',
      page: 1,
      pageSize: 20,
    });
    expect(within(tabla).getByRole('link', { name: 'Sudadero con capucha' })).toHaveAttribute(
      'href',
      '/consola/productos/8',
    );
    expect(within(tabla).getByAltText('Imagen de Sudadero con capucha')).toBeInTheDocument();
    expect(within(tabla).getByText(/Q 249.00/)).toBeInTheDocument();
    expect(within(tabla).getByText('Inactivo')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Camisetas (inactiva)' })).toBeInTheDocument();
  });

  const pagina = (items: ProductoListado[]) => ({
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    vi.mocked(productosApi.listar).mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<ProductosPage />, { ruta: '/consola/productos' });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando lista de productos' })).toBeInTheDocument();
  });

  it('error → ErrorState con requestId y Reintentar', async () => {
    // Arrange
    vi.mocked(productosApi.listar)
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-31'))
      .mockResolvedValueOnce(pagina([producto]));
    renderizar(<ProductosPage />, { ruta: '/consola/productos' });
    expect(await screen.findByText('Referencia: req-31')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('Sudadero con capucha')).toBeInTheDocument();
  });

  it('sin productos ni filtros → "Aún no hay productos"', async () => {
    // Arrange
    vi.mocked(productosApi.listar).mockResolvedValue(pagina([]));

    // Act
    renderizar(<ProductosPage />, { ruta: '/consola/productos' });

    // Assert
    expect(await screen.findByText('Aún no hay productos')).toBeInTheDocument();
  });

  it('sin productos con filtros → "Limpiar filtros" quita los filtros', async () => {
    // Arrange
    vi.mocked(productosApi.listar).mockResolvedValue(pagina([]));
    const { router } = renderizar(<ProductosPage />, {
      ruta: '/consola/productos?q=zzz&activo=true',
    });
    await screen.findByText('No hay productos con esos filtros');

    // Act
    await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]!);

    // Assert
    expect(router.state.location.search).toBe('');
  });

  it('producto sin variantes (precio nulo) → no muestra rango de precios', async () => {
    // Arrange
    vi.mocked(productosApi.listar).mockResolvedValue(
      pagina([{ ...producto, precioMinimo: null, precioMaximo: null, cantidadVariantes: 0 }]),
    );

    // Act
    renderizar(<ProductosPage />, { ruta: '/consola/productos' });

    // Assert
    await screen.findByText('Sudadero con capucha');
    expect(screen.queryByText(/Q 249.00/)).not.toBeInTheDocument();
  });

  it('precio mínimo igual al máximo → un solo precio', async () => {
    // Arrange
    vi.mocked(productosApi.listar).mockResolvedValue(
      pagina([{ ...producto, precioMinimo: '249.00', precioMaximo: '249.00' }]),
    );

    // Act
    renderizar(<ProductosPage />, { ruta: '/consola/productos' });

    // Assert
    expect(await screen.findByText('Q 249.00')).toBeInTheDocument();
    expect(screen.queryByText(/Q 249.00 – /)).not.toBeInTheDocument();
  });

  it('cambiar categoría y estado → filtros en la URL y vuelve a la página 1', async () => {
    // Arrange
    vi.mocked(productosApi.listar).mockResolvedValue(pagina([producto]));
    const { router } = renderizar(<ProductosPage />, { ruta: '/consola/productos?page=2' });
    await screen.findByText('Sudadero con capucha');
    await screen.findByRole('option', { name: 'Camisetas (inactiva)' });

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Camisetas (inactiva)');

    // Assert
    expect(router.state.location.search).toBe('?idCategoria=1');
    expect(productosApi.listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ idCategoria: '1', page: 1 }),
    );
  });

  it('el nuevo producto enlaza al alta', async () => {
    // Arrange
    vi.mocked(productosApi.listar).mockResolvedValue(pagina([producto]));

    // Act
    renderizar(<ProductosPage />, { ruta: '/consola/productos' });

    // Assert
    expect(screen.getByRole('link', { name: 'Nuevo producto' })).toHaveAttribute(
      'href',
      '/consola/productos/nuevo',
    );
  });
});
