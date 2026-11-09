import { describe, expect, it } from 'vitest';
import {
  codigoPostalOpcional,
  telefonoObligatorio,
} from '../../../../src/shared/utils/esquemas.js';

describe('telefonoObligatorio', () => {
  it.each(['22223333', '2222-3333', '+502 2222 3333', ' 2222-3333 '])('acepta %s', (valor) => {
    // Act
    const resultado = telefonoObligatorio(20).safeParse(valor);

    // Assert
    expect(resultado.success).toBe(true);
  });

  it('recorta los espacios del extremo', () => {
    // Act
    const resultado = telefonoObligatorio(20).parse(' 2222-3333 ');

    // Assert
    expect(resultado).toBe('2222-3333');
  });

  it.each([
    ['vacío', ''],
    ['con letras', '2222-abcd'],
    ['de 7 dígitos', '1234567'],
    ['que supera el máximo', '1'.repeat(21)],
    ['no es texto', 22223333],
  ])('rechaza un teléfono %s', (_caso, valor) => {
    // Act
    const resultado = telefonoObligatorio(20).safeParse(valor);

    // Assert
    expect(resultado.success).toBe(false);
  });
});

describe('codigoPostalOpcional', () => {
  it('acepta 5 dígitos', () => {
    // Act
    const resultado = codigoPostalOpcional(10).parse('01010');

    // Assert
    expect(resultado).toBe('01010');
  });

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('%s se guarda como null', (_caso, valor) => {
    // Act
    const resultado = codigoPostalOpcional(10).parse(valor);

    // Assert
    expect(resultado).toBeNull();
  });

  it.each([
    ['de 4 dígitos', '0101'],
    ['de 6 dígitos', '010101'],
    ['con letras', 'AB123'],
    ['más largo que el máximo', '1'.repeat(11)],
  ])('rechaza un código %s', (_caso, valor) => {
    // Act
    const resultado = codigoPostalOpcional(10).safeParse(valor);

    // Assert
    expect(resultado.success).toBe(false);
  });
});
