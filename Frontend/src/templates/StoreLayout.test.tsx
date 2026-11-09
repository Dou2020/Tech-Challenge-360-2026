import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTiempoRealPedidos } from '../hooks/useTiempoRealPedidos';
import { carritoApi } from '../services/api/carrito';
import { crearCarrito } from '../test/fixtures/carrito';
import { crearAdmin, crearCliente, crearOperador } from '../test/fixtures/usuarios';
import { crearAuth, renderizar } from '../test/renderizar';
import { StoreLayout } from './StoreLayout';

vi.mock('../services/api/carrito', () => ({
  carritoApi: { obtener: vi.fn() },
}));
const api = vi.mocked(carritoApi);
vi.mock('../hooks/useTiempoRealPedidos', () => ({ useTiempoRealPedidos: vi.fn() }));
const tiempoReal = vi.mocked(useTiempoRealPedidos);

describe('StoreLayout', () => {
  beforeEach(() => {
    api.obtener.mockReset().mockResolvedValue(crearCarrito({ cantidadUnidades: 3 }));
  });

  it('invitado → ve Iniciar sesión y el carrito, y no el menú de cuenta', () => {
    // Act
    renderizar(<StoreLayout />);

    // Assert
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Carrito' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cuenta/ })).not.toBeInTheDocument();
  });

  it('Cliente → ve el carrito con sus unidades y el menú de cuenta', async () => {
    // Act
    renderizar(<StoreLayout />, {
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
    });

    // Assert
    expect(await screen.findByRole('link', { name: 'Carrito, 3 unidades' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ana/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
  });

  it.each([
    ['Operador', crearOperador()],
    ['Administrador', crearAdmin()],
  ])('%s → no ve el carrito y no se consulta su API', (_rol, usuario) => {
    // Act
    renderizar(<StoreLayout />, { auth: crearAuth({ usuario, estado: 'autenticado' }) });

    // Assert
    expect(screen.queryByRole('link', { name: /^Carrito/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(usuario.nombre) })).toBeInTheDocument();
    expect(api.obtener).not.toHaveBeenCalled();
  });

  it('buscar un texto → navega al catálogo con ?q= codificado', async () => {
    // Arrange
    const { router } = renderizar(<StoreLayout />, {
      rutas: [{ path: '/catalogo', element: <p>Pantalla del catálogo</p> }],
    });
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar productos' }),
      'tenis rojos',
    );

    // Act
    await userEvent.keyboard('{Enter}');

    // Assert
    expect(await screen.findByText('Pantalla del catálogo')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/catalogo');
    expect(router.state.location.search).toBe('?q=tenis%20rojos');
  });

  it('buscar con el cuadro vacío → navega al catálogo sin filtro', async () => {
    // Arrange
    const { router } = renderizar(<StoreLayout />, {
      ruta: '/?q=viejo',
      patron: '/',
      rutas: [{ path: '/catalogo', element: <p>Pantalla del catálogo</p> }],
    });
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar productos' }));

    // Act
    await userEvent.keyboard('{Enter}');

    // Assert
    expect(await screen.findByText('Pantalla del catálogo')).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
  });

  it('el cuadro de búsqueda toma el valor de ?q= de la URL', () => {
    // Act
    renderizar(<StoreLayout />, { ruta: '/?q=camisa', patron: '/' });

    // Assert
    expect(screen.getByRole('searchbox', { name: 'Buscar productos' })).toHaveValue('camisa');
  });

  it.each([
    ['invitado', null, false],
    ['Cliente', crearCliente(), true],
    ['Operador', crearOperador(), false],
    ['Administrador', crearAdmin(), false],
  ] as const)('tiempo real de pedidos: %s → activo %s', (_rol, usuario, activo) => {
    // Arrange
    tiempoReal.mockClear();

    // Act
    renderizar(<StoreLayout />, {
      auth: crearAuth({ usuario, estado: usuario ? 'autenticado' : 'anonimo' }),
    });

    // Assert
    expect(tiempoReal).toHaveBeenLastCalledWith(activo);
  });
});
