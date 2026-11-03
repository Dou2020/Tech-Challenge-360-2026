import { describe, expect, it } from 'vitest';
import { tarjetaBody } from '../../../../src/modules/tarjetas/tarjetas.schemas.js';

describe('tarjetaBody', () => {
  const base = { titular: ' Ana López ', ultimos4: '4242', tipo: 'CREDITO', marca: 'VISA' };

  it('recorta el titular y predeterminada queda en false por defecto', () => {
    // Act
    const resultado = tarjetaBody.parse(base);

    // Assert
    expect(resultado).toEqual({
      titular: 'Ana López',
      ultimos4: '4242',
      tipo: 'CREDITO',
      marca: 'VISA',
      predeterminada: false,
    });
  });

  it.each([
    ['últimos 4 con letras', { ultimos4: '42a2' }],
    ['últimos 4 de 5 dígitos', { ultimos4: '42424' }],
    ['titular vacío', { titular: ' ' }],
    ['tipo desconocido', { tipo: 'PREPAGO' }],
    ['marca desconocida', { marca: 'DINERS' }],
    ['sin tipo', { tipo: undefined }],
    ['predeterminada no booleana', { predeterminada: 'si' }],
  ])('rechaza %s', (_caso, cambio) => {
    // Act
    const resultado = tarjetaBody.safeParse({ ...base, ...cambio });

    // Assert
    expect(resultado.success).toBe(false);
  });
});
