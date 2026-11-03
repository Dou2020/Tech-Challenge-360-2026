import { describe, expect, it } from 'vitest';
import { construirQuery } from './consulta';

describe('construirQuery', () => {
  it('omite vacíos y undefined, y conserva 0 y false', () => {
    // Act
    const consulta = construirQuery({
      q: 'tenis',
      page: 0,
      disponible: false,
      sort: '',
      x: undefined,
    });

    // Assert
    expect(consulta).toBe('?q=tenis&page=0&disponible=false');
  });

  it('sin parámetros → cadena vacía', () => {
    // Act & Assert
    expect(construirQuery({})).toBe('');
  });

  it('codifica los valores', () => {
    // Act & Assert
    expect(construirQuery({ q: 'a b&c' })).toBe('?q=a+b%26c');
  });
});
