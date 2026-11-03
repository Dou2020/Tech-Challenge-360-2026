import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestCart } from './guestCart';

describe('guestCart', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('guarda el token en localStorage y lo devuelve', () => {
    // Arrange
    const token = '2b1f0c8e-6a3d-4f0e-9c1a-7d5e8b2f4a10';

    // Act
    guestCart.guardar(token);

    // Assert
    expect(guestCart.obtener()).toBe(token);
    expect(guestCart.cabeceras()).toEqual({ 'X-Cart-Token': token });
  });

  it('sin token no envía el header', () => {
    // Arrange
    guestCart.borrar();

    // Act
    const cabeceras = guestCart.cabeceras();

    // Assert
    expect(guestCart.obtener()).toBeNull();
    expect(cabeceras).toEqual({});
  });

  it('borra el token guardado', () => {
    // Arrange
    guestCart.guardar('abc');

    // Act
    guestCart.borrar();

    // Assert
    expect(guestCart.obtener()).toBeNull();
  });

  it('si el almacenamiento falla no lanza errores', () => {
    // Arrange
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });

    // Act
    const guardar = () => guestCart.guardar('abc');

    // Assert
    expect(guardar).not.toThrow();
    expect(guestCart.obtener()).toBeNull();
  });
});
