import { afterEach, describe, expect, it } from 'vitest';
import { idempotencia } from './idempotencia';

describe('idempotencia', () => {
  afterEach(() => sessionStorage.clear());

  it('crea una clave UUID y la guarda en sessionStorage', () => {
    // Arrange
    expect(idempotencia.actual()).toBeNull();

    // Act
    const clave = idempotencia.obtenerOCrear();

    // Assert
    expect(clave).toMatch(/^[0-9a-f-]{36}$/);
    expect(idempotencia.actual()).toBe(clave);
  });

  it('un reintento reutiliza la misma clave', () => {
    // Arrange
    const primera = idempotencia.obtenerOCrear();

    // Act
    const segunda = idempotencia.obtenerOCrear();

    // Assert
    expect(segunda).toBe(primera);
  });

  it('al descartarla, el siguiente intento recibe una clave distinta', () => {
    // Arrange
    const primera = idempotencia.obtenerOCrear();

    // Act
    idempotencia.descartar();
    const siguiente = idempotencia.obtenerOCrear();

    // Assert
    expect(siguiente).not.toBe(primera);
  });
});
