import { describe, expect, it } from 'vitest';
import { crearLineaCarrito } from '../test/fixtures/carrito';
import type { Variante } from '../types/catalogo';
import {
  agruparAtributos,
  elegirValor,
  encontrarVariante,
  productoEnCarrito,
  seleccionDeVariante,
  varianteInicial,
} from './variantes';

const TALLA = { idAtributo: 1, atributo: 'Talla' };
const COLOR = { idAtributo: 2, atributo: 'Color' };

function variante(
  id: number,
  talla: [number, string],
  color: [number, string],
  stock: number,
): Variante {
  return {
    idVariante: id,
    sku: `SKU-${id}`,
    precio: '100.00',
    existenciaDisponible: stock,
    descripcion: null,
    valores: [
      { ...TALLA, idValorAtributo: talla[0], valor: talla[1] },
      { ...COLOR, idValorAtributo: color[0], valor: color[1] },
    ],
  };
}

// M/Azul sin stock, M/Rojo con stock, L/Azul con stock. No existe L/Rojo.
const variantes = [
  variante(1, [10, 'M'], [20, 'Azul'], 0),
  variante(2, [10, 'M'], [21, 'Rojo'], 5),
  variante(3, [11, 'L'], [20, 'Azul'], 3),
];

describe('variantes', () => {
  it('agruparAtributos → un grupo por atributo, sin valores repetidos y en orden', () => {
    // Act
    const grupos = agruparAtributos(variantes);

    // Assert
    expect(grupos).toEqual([
      {
        idAtributo: 1,
        atributo: 'Talla',
        valores: [
          { idValorAtributo: 10, valor: 'M' },
          { idValorAtributo: 11, valor: 'L' },
        ],
      },
      {
        idAtributo: 2,
        atributo: 'Color',
        valores: [
          { idValorAtributo: 20, valor: 'Azul' },
          { idValorAtributo: 21, valor: 'Rojo' },
        ],
      },
    ]);
  });

  it('seleccionDeVariante → mapa atributo → valor', () => {
    // Act & Assert
    expect(seleccionDeVariante(variantes[1]!)).toEqual({ 1: 10, 2: 21 });
  });

  it('encontrarVariante → la que coincide exactamente', () => {
    // Act & Assert
    expect(encontrarVariante(variantes, { 1: 11, 2: 20 })?.idVariante).toBe(3);
  });

  it('encontrarVariante → undefined si la combinación no existe o está incompleta', () => {
    // Act & Assert
    expect(encontrarVariante(variantes, { 1: 11, 2: 21 })).toBeUndefined();
    expect(encontrarVariante(variantes, { 1: 11 })).toBeUndefined();
  });

  it('varianteInicial → la primera con existencia', () => {
    // Act & Assert
    expect(varianteInicial(variantes)?.idVariante).toBe(2);
  });

  it('varianteInicial → si ninguna tiene existencia, la primera; sin variantes, undefined', () => {
    // Act & Assert
    expect(varianteInicial([variante(1, [10, 'M'], [20, 'Azul'], 0)])?.idVariante).toBe(1);
    expect(varianteInicial([])).toBeUndefined();
  });

  it('elegirValor con combinación existente → solo cambia ese atributo', () => {
    // Act
    const seleccion = elegirValor(variantes, { 1: 10, 2: 21 }, 2, 20);

    // Assert
    expect(seleccion).toEqual({ 1: 10, 2: 20 });
  });

  it('elegirValor con combinación inexistente → adopta la primera variante con ese valor y existencia', () => {
    // Act: L/Rojo no existe; con L solo está L/Azul.
    const seleccion = elegirValor(variantes, { 1: 10, 2: 21 }, 1, 11);

    // Assert
    expect(seleccion).toEqual({ 1: 11, 2: 20 });
  });

  it('elegirValor con un valor que ninguna variante tiene → conserva la selección', () => {
    // Act
    const seleccion = elegirValor(variantes, { 1: 10, 2: 21 }, 1, 99);

    // Assert
    expect(seleccion).toEqual({ 1: 10, 2: 21 });
  });
});

describe('productoEnCarrito', () => {
  it('suma las unidades por variante del producto y toma la línea agregada al final', () => {
    // Arrange
    const items = [
      crearLineaCarrito({
        idProducto: 5,
        idVariante: 12,
        cantidad: 1,
        fechaAgregado: '2026-11-02T10:00:00.000Z',
      }),
      crearLineaCarrito({
        idProducto: 9,
        idVariante: 41,
        cantidad: 4,
        fechaAgregado: '2026-11-03T10:00:00.000Z',
      }),
      crearLineaCarrito({
        idProducto: 5,
        idVariante: 11,
        cantidad: 2,
        fechaAgregado: '2026-11-02T12:00:00.000Z',
      }),
    ];

    // Act
    const resultado = productoEnCarrito(items, 5);

    // Assert
    expect([...resultado.porVariante]).toEqual([
      [12, 1],
      [11, 2],
    ]);
    expect(resultado.idVarianteReciente).toBe(11);
  });

  it('producto que no está en el carrito → mapa vacío y sin variante', () => {
    // Act
    const resultado = productoEnCarrito([crearLineaCarrito({ idProducto: 9 })], 5);

    // Assert
    expect(resultado.porVariante.size).toBe(0);
    expect(resultado.idVarianteReciente).toBeUndefined();
  });
});
