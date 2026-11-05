import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { atributosApi, categoriasApi, productosApi } from '../../services/api/gestion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import ProductoNuevoPage from './ProductoNuevoPage';

vi.mock('../../services/api/gestion', () => ({
  categoriasApi: { listar: vi.fn() },
  productosApi: { crear: vi.fn() },
  atributosApi: { listar: vi.fn() },
}));

const categoria = {
  idCategoria: 1,
  nombre: 'Camisetas',
  descripcion: null,
  activo: true,
  cantidadProductos: 0,
  cantidadCupones: 0,
};

const rutas = [
  { path: '/consola/productos', element: <p>Lista de productos</p> },
  { path: '/consola/productos/:id', element: <p>Editar producto</p> },
];

async function llenar() {
  await userEvent.type(await screen.findByLabelText('Nombre'), 'Sudadero');
  await userEvent.selectOptions(screen.getByLabelText('Categoría'), 'Camisetas');
  await userEvent.type(screen.getByLabelText('SKU de la variante 1'), 'SUD-M');
  await userEvent.type(screen.getByLabelText('Precio de la variante 1'), '249.00');
  await userEvent.type(screen.getByLabelText('Existencia inicial de la variante 1'), '10');
}

describe('ProductoNuevoPage', () => {
  beforeEach(() => {
    vi.mocked(categoriasApi.listar)
      .mockReset()
      .mockResolvedValue({ items: [categoria], page: 1, pageSize: 100, total: 1 });
    vi.mocked(productosApi.crear).mockReset();
    vi.mocked(atributosApi.listar).mockReset().mockResolvedValue([]);
  });

  it('cargando categorías → muestra el estado de carga', () => {
    // Arrange
    vi.mocked(categoriasApi.listar).mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<ProductoNuevoPage />, { ruta: '/consola/productos/nuevo' });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando categorías' })).toBeInTheDocument();
  });

  it('error al cargar categorías → ErrorState con requestId y Reintentar', async () => {
    // Arrange
    vi.mocked(categoriasApi.listar)
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-4'))
      .mockResolvedValueOnce({ items: [categoria], page: 1, pageSize: 100, total: 1 });
    renderizar(<ProductoNuevoPage />, { ruta: '/consola/productos/nuevo' });
    expect(await screen.findByText('Referencia: req-4')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument();
  });

  it('guardar → crea el producto y navega a su edición con state.creado', async () => {
    // Arrange
    vi.mocked(productosApi.crear).mockResolvedValue({ idProducto: 77 } as never);
    const { router } = renderizar(<ProductoNuevoPage />, {
      ruta: '/consola/productos/nuevo',
      rutas,
    });
    await llenar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    // Assert
    expect(await screen.findByText('Editar producto')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/consola/productos/77');
    expect(router.state.location.state).toEqual({ creado: true });
    expect(productosApi.crear).toHaveBeenCalledWith(
      expect.objectContaining({ idCategoria: 1, nombre: 'Sudadero' }),
    );
  });

  it('Cancelar → vuelve a la lista de productos sin crear nada', async () => {
    // Arrange
    renderizar(<ProductoNuevoPage />, { ruta: '/consola/productos/nuevo', rutas });
    await screen.findByLabelText('Nombre');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(await screen.findByText('Lista de productos')).toBeInTheDocument();
    expect(productosApi.crear).not.toHaveBeenCalled();
  });
});
