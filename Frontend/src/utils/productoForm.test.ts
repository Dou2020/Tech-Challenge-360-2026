import { describe, expect, it, vi } from 'vitest';
import type { VarianteGestion } from '../types/gestion';
import {
  claveAtributo,
  esPrecioValido,
  esquemaProductoNuevo,
  esquemaVariante,
  idsDeValores,
  validarVariantes,
  valoresDeVariante,
  varianteVacia,
} from './productoForm';

describe('productoForm', () => {
  it.each([
    ['149.00', true],
    ['149', true],
    ['0.5', true],
    ['9999999999.99', true],
    ['0', false],
    ['0.00', false],
    ['-5', false],
    ['1.234', false],
    ['abc', false],
    ['', false],
    ['12345678901', false],
  ])('esPrecioValido(%s) → %s', (texto, esperado) => {
    // Act & Assert
    expect(esPrecioValido(texto)).toBe(esperado);
  });

  it('claveAtributo → a<id>', () => {
    // Act & Assert
    expect(claveAtributo(7)).toBe('a7');
  });

  it('idsDeValores → ignora vacíos y convierte a número', () => {
    // Act & Assert
    expect(idsDeValores({ a1: '5', a2: '', a3: '9' })).toEqual([5, 9]);
    expect(idsDeValores(undefined)).toEqual([]);
  });

  it('valoresDeVariante → clave a<atributo> con el id del valor como texto', () => {
    // Arrange
    const variante = {
      valores: [
        { idAtributo: 1, atributo: 'Talla', idValorAtributo: 5, valor: 'M' },
        { idAtributo: 2, atributo: 'Color', idValorAtributo: 9, valor: 'Azul' },
      ],
    } as VarianteGestion;

    // Act & Assert
    expect(valoresDeVariante(variante)).toEqual({ a1: '5', a2: '9' });
  });

  it('esquemaVariante → exige SKU y precio válido; existencia vacía es válida', () => {
    // Act
    const mala = esquemaVariante.safeParse({
      sku: '',
      precio: '0',
      existenciaInicial: '',
      valores: {},
    });
    const buena = esquemaVariante.safeParse({
      sku: 'X',
      precio: '10.50',
      existenciaInicial: '',
      valores: {},
    });

    // Assert
    expect(mala.success).toBe(false);
    expect(buena.success).toBe(true);
  });

  it('esquemaVariante → existencia decimal o excesiva se rechaza', () => {
    // Act & Assert
    for (const e of ['1.5', '-1', '1000001']) {
      expect(
        esquemaVariante.safeParse({ sku: 'X', precio: '10', existenciaInicial: e, valores: {} })
          .success,
      ).toBe(false);
    }
  });

  it('validarVariantes → marca SKU repetido (sin distinguir mayúsculas) y combinación repetida', () => {
    // Arrange
    const agregar = vi.fn();

    // Act
    validarVariantes(
      [
        { sku: 'ABC', valores: { a1: '5', a2: '9' } },
        { sku: 'abc', valores: { a2: '9', a1: '5' } },
      ],
      agregar,
    );

    // Assert
    expect(agregar).toHaveBeenCalledWith(1, 'sku', 'Este SKU está repetido en el formulario.');
    expect(agregar).toHaveBeenCalledWith(
      1,
      'valores',
      'Otra variante tiene la misma combinación de valores.',
    );
  });

  it('validarVariantes → SKU y combinaciones distintos no generan errores', () => {
    // Arrange
    const agregar = vi.fn();

    // Act
    validarVariantes(
      [
        { sku: 'A', valores: { a1: '5' } },
        { sku: 'B', valores: { a1: '6' } },
        { sku: 'C', valores: {} },
        { sku: 'D', valores: {} },
      ],
      agregar,
    );

    // Assert
    expect(agregar).not.toHaveBeenCalled();
  });

  it('esquemaProductoNuevo → exige al menos una variante', () => {
    // Act
    const resultado = esquemaProductoNuevo.safeParse({
      idCategoria: '1',
      nombre: 'Tenis',
      descripcion: '',
      variantes: [],
    });

    // Assert
    expect(resultado.success).toBe(false);
  });

  it('esquemaProductoNuevo → máximo 50 variantes', () => {
    // Arrange
    const variantes = Array.from({ length: 51 }, (_, i) => ({
      sku: `S${i}`,
      precio: '10',
      existenciaInicial: '',
      valores: { a1: String(i + 1) },
    }));

    // Act
    const resultado = esquemaProductoNuevo.safeParse({
      idCategoria: '1',
      nombre: 'Tenis',
      descripcion: '',
      variantes,
    });

    // Assert
    expect(resultado.success).toBe(false);
  });

  it('varianteVacia → campos vacíos', () => {
    // Act & Assert
    expect(varianteVacia()).toEqual({ sku: '', precio: '', existenciaInicial: '', valores: {} });
  });
});
