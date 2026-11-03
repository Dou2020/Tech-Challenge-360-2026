import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { simularTemaSistema } from '../test/matchMedia';
import { CLAVE_TEMA, aplicarTema, guardarPreferencia, leerPreferencia, temaEfectivo } from './tema';

describe('tema', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#fafafa" />';
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sin preferencia guardada → sistema', () => {
    // Act
    const preferencia = leerPreferencia();

    // Assert
    expect(preferencia).toBe('sistema');
  });

  it.each(['claro', 'oscuro'] as const)('guarda %s y lo vuelve a leer', (preferencia) => {
    // Act
    guardarPreferencia(preferencia);

    // Assert
    expect(localStorage.getItem(CLAVE_TEMA)).toBe(preferencia);
    expect(leerPreferencia()).toBe(preferencia);
  });

  it('elegir sistema borra la clave, así index.html sigue al sistema operativo', () => {
    // Arrange
    guardarPreferencia('oscuro');

    // Act
    guardarPreferencia('sistema');

    // Assert
    expect(localStorage.getItem(CLAVE_TEMA)).toBeNull();
    expect(leerPreferencia()).toBe('sistema');
  });

  it('un valor desconocido en localStorage cuenta como sistema', () => {
    // Arrange
    localStorage.setItem(CLAVE_TEMA, 'azul');

    // Act
    const preferencia = leerPreferencia();

    // Assert
    expect(preferencia).toBe('sistema');
  });

  it('con el almacenamiento bloqueado no lanza y recuerda la preferencia en memoria', () => {
    // Arrange
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });

    // Act
    guardarPreferencia('oscuro');

    // Assert
    expect(leerPreferencia()).toBe('oscuro');
  });

  it.each([
    [true, 'oscuro'],
    [false, 'claro'],
  ] as const)('sistema con prefers-color-scheme oscuro=%s → %s', (oscuro, esperado) => {
    // Arrange
    simularTemaSistema(oscuro);

    // Act
    const tema = temaEfectivo('sistema');

    // Assert
    expect(tema).toBe(esperado);
  });

  it('sin matchMedia (jsdom) el sistema cuenta como claro', () => {
    // Act
    const tema = temaEfectivo('sistema');

    // Assert
    expect(tema).toBe('claro');
  });

  it('una preferencia explícita no consulta al sistema', () => {
    // Arrange
    simularTemaSistema(true);

    // Act
    const tema = temaEfectivo('claro');

    // Assert
    expect(tema).toBe('claro');
  });

  it('aplicar oscuro pone la clase dark en <html> y el color de la barra', () => {
    // Act
    aplicarTema('oscuro');

    // Assert
    expect(document.documentElement).toHaveClass('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#09090b',
    );
  });

  it('aplicar claro quita la clase dark', () => {
    // Arrange
    aplicarTema('oscuro');

    // Act
    aplicarTema('claro');

    // Assert
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#fafafa',
    );
  });
});
