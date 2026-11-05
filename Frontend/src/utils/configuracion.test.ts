import { describe, expect, it } from 'vitest';
import { ayudaParametro, validarParametro } from './configuracion';

describe('configuracion', () => {
  it.each([
    ['MinutosReserva', '15', null],
    ['MinutosReserva', '1', null],
    ['MinutosReserva', '120', null],
    ['MinutosReserva', '0', 'Entero de 1 a 120 minutos.'],
    ['MinutosReserva', '121', 'Entero de 1 a 120 minutos.'],
    ['MinutosReserva', '1.5', 'Entero de 1 a 120 minutos.'],
    ['MinutosReserva', 'abc', 'Entero de 1 a 120 minutos.'],
    ['HorasCarritoAbandonado', '720', null],
    ['HorasCarritoAbandonado', '721', 'Entero de 1 a 720 horas.'],
    ['UmbralBajoStock', '0', null],
    ['UmbralBajoStock', '5000', null],
    ['UmbralBajoStock', '-1', 'Entero mayor o igual a 0.'],
    ['PorcentajeIVA', '12', null],
    ['PorcentajeIVA', '12.50', null],
    ['PorcentajeIVA', '100', null],
    ['PorcentajeIVA', '100.01', 'Porcentaje de 0 a 100, hasta 2 decimales.'],
    ['PorcentajeIVA', '12.345', 'Porcentaje de 0 a 100, hasta 2 decimales.'],
  ])('validarParametro(%s, %s) → %s', (clave, valor, esperado) => {
    // Act & Assert
    expect(validarParametro(clave, valor)).toBe(esperado);
  });

  it('valor vacío o solo espacios → "Es obligatorio."', () => {
    // Act & Assert
    expect(validarParametro('MinutosReserva', '   ')).toBe('Es obligatorio.');
  });

  it('valor de más de 200 caracteres → error de longitud', () => {
    // Act & Assert
    expect(validarParametro('Otro', 'x'.repeat(201))).toBe('Máximo 200 caracteres.');
  });

  it('parámetro sin reglas propias → cualquier texto válido', () => {
    // Act & Assert
    expect(validarParametro('NombreTienda', 'ShopCart')).toBeNull();
  });

  it('ayudaParametro → texto para los conocidos y undefined para el resto', () => {
    // Act & Assert
    expect(ayudaParametro('MinutosReserva')).toBe('Entero de 1 a 120 minutos.');
    expect(ayudaParametro('NombreTienda')).toBeUndefined();
  });
});
