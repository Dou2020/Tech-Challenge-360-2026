import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Variante } from '../types/catalogo';
import { MAXIMO_POR_LINEA, useSeleccionVariante } from './useSeleccionVariante';

function variante(id: number, valorTalla: number, stock: number): Variante {
  return {
    idVariante: id,
    sku: `SKU-${id}`,
    precio: '100.00',
    existenciaDisponible: stock,
    descripcion: null,
    valores: [
      { idAtributo: 1, atributo: 'Talla', idValorAtributo: valorTalla, valor: `T${valorTalla}` },
    ],
  };
}

const variantes = [variante(1, 10, 0), variante(2, 11, 5), variante(3, 12, 5000)];

describe('useSeleccionVariante', () => {
  it('inicia con la primera variante con existencia y cantidad 1', () => {
    // Act
    const { result } = renderHook(() => useSeleccionVariante(variantes));

    // Assert
    expect(result.current.variante?.idVariante).toBe(2);
    expect(result.current.maximo).toBe(5);
    expect(result.current.cantidad).toBe(1);
  });

  it('elegir otra variante → cambia la variante y reinicia la cantidad a 1', () => {
    // Arrange
    const { result } = renderHook(() => useSeleccionVariante(variantes));
    act(() => result.current.setCantidad(4));

    // Act
    act(() => result.current.elegir(1, 12));

    // Assert
    expect(result.current.variante?.idVariante).toBe(3);
    expect(result.current.cantidad).toBe(1);
  });

  it('cantidad mayor que la existencia → se recorta al máximo', () => {
    // Arrange
    const { result } = renderHook(() => useSeleccionVariante(variantes));

    // Act
    act(() => result.current.setCantidad(50));

    // Assert
    expect(result.current.cantidad).toBe(5);
  });

  it('cantidad menor que 1 → se sube a 1', () => {
    // Arrange
    const { result } = renderHook(() => useSeleccionVariante(variantes));

    // Act
    act(() => result.current.setCantidad(0));

    // Assert
    expect(result.current.cantidad).toBe(1);
  });

  it('variante sin existencia → máximo y cantidad en 0', () => {
    // Act
    const { result } = renderHook(() => useSeleccionVariante([variante(1, 10, 0)]));

    // Assert
    expect(result.current.maximo).toBe(0);
    expect(result.current.cantidad).toBe(0);
  });

  it('existencia enorme → el máximo no pasa del tope por línea', () => {
    // Arrange
    const { result } = renderHook(() => useSeleccionVariante(variantes));

    // Act
    act(() => result.current.elegir(1, 12));

    // Assert
    expect(result.current.maximo).toBe(Math.min(5000, MAXIMO_POR_LINEA));
  });

  it('agrupa los atributos para el selector', () => {
    // Act
    const { result } = renderHook(() => useSeleccionVariante(variantes));

    // Assert
    expect(result.current.grupos).toHaveLength(1);
    expect(result.current.grupos[0]?.atributo).toBe('Talla');
  });
  it('idVarianteInicial de la lista → arranca en esa variante', () => {
    // Act
    const { result } = renderHook(() => useSeleccionVariante(variantes, { idVarianteInicial: 3 }));

    // Assert
    expect(result.current.variante?.idVariante).toBe(3);
    expect(result.current.cantidad).toBe(1);
  });

  it('idVarianteInicial que no existe → cae en la primera con existencia', () => {
    // Act
    const { result } = renderHook(() => useSeleccionVariante(variantes, { idVarianteInicial: 99 }));

    // Assert
    expect(result.current.variante?.idVariante).toBe(2);
  });

  it('unidades en el carrito → el máximo es la existencia menos lo que ya está', () => {
    // Arrange
    const enCarrito = new Map([[2, 3]]);

    // Act
    const { result } = renderHook(() => useSeleccionVariante(variantes, { enCarrito }));

    // Assert
    expect(result.current.enCarrito).toBe(3);
    expect(result.current.maximo).toBe(2);
  });

  it('todo lo disponible ya está en el carrito → máximo y cantidad en 0', () => {
    // Arrange
    const enCarrito = new Map([[2, 5]]);

    // Act
    const { result } = renderHook(() => useSeleccionVariante(variantes, { enCarrito }));

    // Assert
    expect(result.current.maximo).toBe(0);
    expect(result.current.cantidad).toBe(0);
  });

  it('las unidades del carrito son por variante', () => {
    // Arrange
    const enCarrito = new Map([[2, 5]]);
    const { result } = renderHook(() => useSeleccionVariante(variantes, { enCarrito }));

    // Act
    act(() => result.current.elegir(1, 12));

    // Assert
    expect(result.current.enCarrito).toBe(0);
    expect(result.current.maximo).toBe(MAXIMO_POR_LINEA);
  });
});
