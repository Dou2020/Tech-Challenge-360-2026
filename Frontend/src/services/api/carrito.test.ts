import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearCarrito } from '../../test/fixtures/carrito';
import { guestCart } from '../../utils/guestCart';
import { request } from '../http';
import { carritoApi } from './carrito';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

describe('carritoApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });
  afterEach(() => localStorage.clear());

  it('obtener con token de invitado → lo envía en X-Cart-Token', async () => {
    // Arrange
    guestCart.guardar('tok-123');
    pedir.mockResolvedValue(crearCarrito());

    // Act
    await carritoApi.obtener();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/carrito', { headers: { 'X-Cart-Token': 'tok-123' } });
  });

  it('obtener sin token → no envía X-Cart-Token', async () => {
    // Arrange
    pedir.mockResolvedValue(crearCarrito());

    // Act
    await carritoApi.obtener();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/carrito', { headers: {} });
  });

  it('agregarItem → POST con idVariante y cantidad, y guarda el tokenInvitado recibido', async () => {
    // Arrange
    pedir.mockResolvedValue(crearCarrito({ tokenInvitado: 'tok-nuevo' }));

    // Act
    await carritoApi.agregarItem(41, 2);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/carrito/items', {
      method: 'POST',
      body: { idVariante: 41, cantidad: 2 },
      headers: {},
    });
    expect(guestCart.obtener()).toBe('tok-nuevo');
  });

  it('agregarItem sin tokenInvitado en la respuesta → no toca el almacenamiento', async () => {
    // Arrange
    pedir.mockResolvedValue(crearCarrito());

    // Act
    await carritoApi.agregarItem(41, 1);

    // Assert
    expect(guestCart.obtener()).toBeNull();
  });

  it('actualizarCantidad → PATCH con la cantidad y el token', async () => {
    // Arrange
    guestCart.guardar('tok-123');
    pedir.mockResolvedValue(crearCarrito());

    // Act
    await carritoApi.actualizarCantidad(41, 4);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/carrito/items/41', {
      method: 'PATCH',
      body: { cantidad: 4 },
      headers: { 'X-Cart-Token': 'tok-123' },
    });
  });

  it('eliminarItem → DELETE de la línea con el token', async () => {
    // Arrange
    guestCart.guardar('tok-123');
    pedir.mockResolvedValue(crearCarrito());

    // Act
    await carritoApi.eliminarItem(41);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/carrito/items/41', {
      method: 'DELETE',
      headers: { 'X-Cart-Token': 'tok-123' },
    });
  });

  it('vaciar → DELETE del carrito', async () => {
    // Arrange
    pedir.mockResolvedValue(crearCarrito());

    // Act
    await carritoApi.vaciar();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/carrito', { method: 'DELETE', headers: {} });
  });

  it('aplicarCupon → POST con el código, sin X-Cart-Token (solo Cliente)', async () => {
    // Arrange
    guestCart.guardar('tok-123');
    pedir.mockResolvedValue(crearCarrito());

    // Act
    await carritoApi.aplicarCupon('VERANO25');

    // Assert
    expect(pedir).toHaveBeenCalledWith('/carrito/cupon', {
      method: 'POST',
      body: { codigo: 'VERANO25' },
    });
  });

  it('quitarCupon → DELETE del cupón', async () => {
    // Arrange
    pedir.mockResolvedValue(crearCarrito());

    // Act
    await carritoApi.quitarCupon();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/carrito/cupon', { method: 'DELETE' });
  });

  it('fusionar → POST con el tokenInvitado en el body', async () => {
    // Arrange
    pedir.mockResolvedValue(crearCarrito());

    // Act
    await carritoApi.fusionar('tok-123');

    // Assert
    expect(pedir).toHaveBeenCalledWith('/carrito/fusionar', {
      method: 'POST',
      body: { tokenInvitado: 'tok-123' },
    });
  });
});
