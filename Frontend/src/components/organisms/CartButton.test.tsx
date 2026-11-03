import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { carritoApi } from '../../services/api/carrito';
import { crearCarrito } from '../../test/fixtures/carrito';
import { crearCliente } from '../../test/fixtures/usuarios';
import { crearAuth, renderizar } from '../../test/renderizar';
import { CartButton } from './CartButton';

vi.mock('../../services/api/carrito', () => ({
  carritoApi: { obtener: vi.fn() },
}));
const api = vi.mocked(carritoApi);

describe('CartButton', () => {
  beforeEach(() => {
    api.obtener.mockReset();
  });

  it('Cliente con unidades → el enlace al carrito indica el número del backend', async () => {
    // Arrange
    api.obtener.mockResolvedValue(crearCarrito({ cantidadUnidades: 5 }));

    // Act
    renderizar(<CartButton />, {
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
    });

    // Assert
    const enlace = await screen.findByRole('link', { name: 'Carrito, 5 unidades' });
    expect(enlace).toHaveAttribute('href', '/carrito');
  });

  it('carrito vacío → solo "Carrito", sin contador', async () => {
    // Arrange
    api.obtener.mockResolvedValue(crearCarrito({ cantidadUnidades: 0, items: [] }));

    // Act
    renderizar(<CartButton />, {
      auth: crearAuth({ usuario: crearCliente(), estado: 'autenticado' }),
    });

    // Assert
    expect(await screen.findByRole('link', { name: 'Carrito' })).toBeInTheDocument();
    expect(api.obtener).toHaveBeenCalled();
  });

  it('invitado sin token → no consulta la API', () => {
    // Act
    renderizar(<CartButton />);

    // Assert
    expect(screen.getByRole('link', { name: 'Carrito' })).toBeInTheDocument();
    expect(api.obtener).not.toHaveBeenCalled();
  });
});
