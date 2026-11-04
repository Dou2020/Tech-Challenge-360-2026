import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type ContextoAuth } from './auth/authContext';
import { carritoApi } from './services/api/carrito';
import { catalogoApi } from './services/api/catalogo';
import { tarjetasApi } from './services/api/tarjetas';
import { ApiError } from './services/http';
import { crearCarrito } from './test/fixtures/carrito';
import { crearCategoria, crearProductoResumen } from './test/fixtures/catalogo';
import { crearAdmin, crearCliente, crearOperador } from './test/fixtures/usuarios';
import { crearAuth } from './test/renderizar';
import { rutas } from './router';

vi.mock('./services/api/catalogo', () => ({
  catalogoApi: { categorias: vi.fn(), buscarProductos: vi.fn(), producto: vi.fn() },
}));
vi.mock('./services/api/carrito', () => ({ carritoApi: { obtener: vi.fn() } }));
vi.mock('./services/api/tarjetas', () => ({ tarjetasApi: { listar: vi.fn() } }));
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

  it.each(['/no-existe', '/consola'])(
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

const operador = () => crearAuth({ usuario: crearOperador(), estado: 'autenticado' });
const admin = () => crearAuth({ usuario: crearAdmin(), estado: 'autenticado' });
const cliente = () => crearAuth({ usuario: crearCliente(), estado: 'autenticado' });

describe('router: vistas del Cliente y de autenticación', () => {
  beforeEach(() => {
    carrito.obtener.mockReset().mockResolvedValue(crearCarrito());
    vi.mocked(tarjetasApi.listar).mockReset();
  });

  it.each(['/cuenta/tarjetas', '/cuenta/pedidos', '/checkout'])(
    'sin sesión en %s → login con redirect a la ruta pedida',
    async (ruta) => {
      // Act
      const router = navegar(ruta);

      // Assert
      await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
      expect(router.state.location.search).toBe(`?redirect=${encodeURIComponent(ruta)}`);
    },
  );

  it.each([
    ['Operador', operador],
    ['Administrador', admin],
  ])('%s en /cuenta/tarjetas → 403', async (_rol, auth) => {
    // Act
    const router = navegar('/cuenta/tarjetas', auth());

    // Assert
    await waitFor(() => expect(router.state.location.pathname).toBe('/403'));
  });

  it('Operador en /cuenta/pedidos (zona del Cliente) → 403', async () => {
    // Act
    const router = navegar('/cuenta/pedidos', operador());

    // Assert
    await waitFor(() => expect(router.state.location.pathname).toBe('/403'));
  });

  it('Cliente en /cuenta/tarjetas → entra a Mis tarjetas', async () => {
    // Arrange
    vi.mocked(tarjetasApi.listar).mockResolvedValue([]);

    // Act
    const router = navegar('/cuenta/tarjetas', cliente());

    // Assert
    expect(await screen.findByRole('heading', { name: 'Mis tarjetas' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cuenta/tarjetas');
  });

  it.each([
    ['/login', 'Iniciar sesión'],
    ['/registro', 'Crear cuenta'],
    ['/recuperar-contrasena', 'Recuperar contraseña'],
  ])('sin sesión en %s → entra a la página fuera de la tienda', async (ruta, titulo) => {
    // Act
    const router = navegar(ruta);

    // Assert
    expect(await screen.findByRole('heading', { name: titulo, level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(ruta);
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  });

  it('/crear-contrasena es pública (sin sesión no redirige al login)', async () => {
    // Act
    const router = navegar('/crear-contrasena#token=abc');

    // Assert
    await waitFor(() => expect(router.state.location.pathname).toBe('/crear-contrasena'));
  });
});
