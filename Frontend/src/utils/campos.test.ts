import { describe, expect, it } from 'vitest';
import { ariaCampo, claseControl } from './campos';

describe('claseControl', () => {
  it.each([
    [true, 'border-peligro', 'border-borde-fuerte'],
    [false, 'border-borde-fuerte', 'border-peligro'],
  ])('con error=%s usa %s', (conError, esperado, ausente) => {
    // Act
    const clases = claseControl(conError).split(' ');

    // Assert
    expect(clases).toContain(esperado);
    expect(clases).not.toContain(ausente);
  });
});

describe('ariaCampo', () => {
  it('con error → aria-invalid y describedby apunta al error', () => {
    // Act
    const atributos = ariaCampo('correo', 'Correo inválido.', 'Ayuda');

    // Assert
    expect(atributos).toEqual({ 'aria-invalid': true, 'aria-describedby': 'correo-error' });
  });

  it('solo con ayuda → describedby apunta a la ayuda', () => {
    // Act
    const atributos = ariaCampo('correo', undefined, 'Ayuda');

    // Assert
    expect(atributos).toEqual({ 'aria-invalid': undefined, 'aria-describedby': 'correo-ayuda' });
  });

  it('sin error ni ayuda → ningún atributo', () => {
    // Act
    const atributos = ariaCampo('correo');

    // Assert
    expect(atributos).toEqual({ 'aria-invalid': undefined, 'aria-describedby': undefined });
  });
});
