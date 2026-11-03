import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type ContextoAuth } from './auth/authContext';
import { carritoApi } from './services/api/carrito';
import { catalogoApi } from './services/api/catalogo';
import { ApiError } from './services/http';
import { crearCarrito } from './test/fixtures/carrito';
import { crearCategoria, crearProductoResumen } from './test/fixtures/catalogo';
import { crearCliente } from './test/fixtures/usuarios';
import { crearAuth } from './test/renderizar';
import { rutas } from './router';

vi.mock('./services/api/catalogo', () => ({
  catalogoApi: { categorias: vi.fn(), buscarProductos: vi.fn(), producto: vi.fn() },
}));
vi.mock('./services/api/carrito', () => ({ carritoApi: { obtener: vi.fn() } }));
const catalogo = vi.mocked(catalogoApi);
const carrito = vi.mocked(carritoApi);

function navegar(ruta: string, auth: ContextoAuth = crearAuth()) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthContext value={auth}>
        <RouterProvider router={router} />
      </AuthContext>
    </QueryClientProvider>,
  );
  return router;
}

describe('router: tienda (vista de invitado)', () => {
  beforeEach(() => {
    catalogo.categorias.mockReset().mockResolvedValue([crearCategoria()]);
    catalogo.buscarProductos
      .mockReset()
      .mockResolvedValue({ items: [crearProductoResumen()], page: 1, pageSize: 12, total: 1 });
    catalogo.producto.mockReset();
    carrito.obtener.mockReset().mockResolvedValue(crearCarrito());
  });

  it.each([
    ['/', 'Bienvenido a ShopCart'],
    ['/catalogo', 'Catálogo'],
    ['/carrito', 'Carrito de compras'],
  ])('sin sesión en %s → entra a la página dentro de la tienda', async (ruta, titulo) => {
    // Act
    const router = navegar(ruta);

    // Assert
    expect(await screen.findByRole('heading', { name: titulo, level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(ruta);
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('Cliente en /carrito → ve su carrito y el menú de cuenta', async () => {
    // Arrange
    const auth = crearAuth({ usuario: crearCliente(), estado: 'autenticado' });

    // Act
    navegar('/carrito', auth);

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Carrito de compras', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
  });

  it('producto inexistente (404 de la API) → NoEncontrado', async () => {
    // Arrange
    catalogo.producto.mockRejectedValue(new ApiError(404, 'NO_ENCONTRADO', 'No existe.'));

    // Act
    navegar('/productos/999');

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    expect(catalogo.producto).toHaveBeenCalledWith(999);
  });

  it('/403 → NoAutorizado', async () => {
    // Act
    navegar('/403');

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' }),
    ).toBeInTheDocument();
  });

  it.each(['/no-existe', '/checkout', '/cuenta/pedidos', '/consola'])(
    '%s (aún sin vista) → NoEncontrado dentro de la tienda',
    async (ruta) => {
      // Act
      navegar(ruta);

      // Assert
      expect(
        await screen.findByRole('heading', { name: 'Página no encontrada' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    },
  );
});
