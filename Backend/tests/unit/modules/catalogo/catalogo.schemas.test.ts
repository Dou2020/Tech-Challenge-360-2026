import { describe, expect, it } from 'vitest';
import {
  buscarProductosQuery,
  categoriaBody,
  crearProductoBody,
  precioBody,
} from '../../../../src/modules/catalogo/catalogo.schemas.js';

describe('buscarProductosQuery', () => {
  it('aplica los defaults y deja los filtros ausentes como undefined (NULL en el SP)', () => {
    expect(buscarProductosQuery.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      sort: 'fechaCreacion:desc',
    });
  });

  it('convierte disponible "true"/"false" en booleano y los montos en number', () => {
    expect(
      buscarProductosQuery.parse({
        disponible: 'false',
        precioMin: '50',
        precioMax: '100.5',
        q: '  ',
      }),
    ).toMatchObject({ disponible: false, precioMin: 50, precioMax: 100.5, q: undefined });
    expect(buscarProductosQuery.parse({ disponible: 'true' }).disponible).toBe(true);
  });

  it('rechaza disponible distinto de true/false, sort fuera de la lista y precioMin > precioMax', () => {
    expect(buscarProductosQuery.safeParse({ disponible: '1' }).success).toBe(false);
    expect(buscarProductosQuery.safeParse({ sort: 'existencia:asc' }).success).toBe(false);
    const rango = buscarProductosQuery.safeParse({ precioMin: '100', precioMax: '50' });
    expect(rango.success).toBe(false);
    expect(rango.error?.issues[0]?.path).toEqual(['precioMax']);
  });
});

describe('crearProductoBody', () => {
  const base = {
    idCategoria: 1,
    nombre: 'Sudadero',
    variantes: [{ sku: 'SUD-1', precio: '149.00' }],
  };

  it('completa existenciaInicial = 0, valores = [] y descripcion = null', () => {
    expect(crearProductoBody.parse(base)).toEqual({
      idCategoria: 1,
      nombre: 'Sudadero',
      descripcion: null,
      variantes: [{ sku: 'SUD-1', precio: 149, existenciaInicial: 0, valores: [] }],
    });
  });

  it('exige al menos una variante, precio > 0 y valores sin repetir', () => {
    expect(crearProductoBody.safeParse({ ...base, variantes: [] }).success).toBe(false);
    expect(
      crearProductoBody.safeParse({ ...base, variantes: [{ sku: 'X', precio: '0' }] }).success,
    ).toBe(false);
    expect(
      crearProductoBody.safeParse({
        ...base,
        variantes: [{ sku: 'X', precio: '10.00', valores: [2, 2] }],
      }).success,
    ).toBe(false);
  });

  it('rechaza un SKU de más de 50 caracteres y una existencia negativa', () => {
    expect(
      crearProductoBody.safeParse({ ...base, variantes: [{ sku: 'A'.repeat(51), precio: '1' }] })
        .success,
    ).toBe(false);
    expect(
      crearProductoBody.safeParse({
        ...base,
        variantes: [{ sku: 'A', precio: '1', existenciaInicial: -1 }],
      }).success,
    ).toBe(false);
  });
});

describe('categoriaBody y precioBody', () => {
  it('una descripción vacía se guarda como NULL; el nombre se recorta', () => {
    expect(categoriaBody.parse({ nombre: '  Ofertas ', descripcion: '' })).toEqual({
      nombre: 'Ofertas',
      descripcion: null,
    });
    expect(categoriaBody.safeParse({ nombre: 'x'.repeat(101) }).success).toBe(false);
  });

  it('el precio es un string con hasta 2 decimales', () => {
    expect(precioBody.parse({ precio: '149.00' })).toEqual({ precio: 149 });
    expect(precioBody.safeParse({ precio: 149 }).success).toBe(false);
    expect(precioBody.safeParse({ precio: '149.001' }).success).toBe(false);
  });
});
