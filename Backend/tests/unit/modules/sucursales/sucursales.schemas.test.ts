import { describe, expect, it } from 'vitest';
import {
  estadoSucursalBody,
  listarSucursalesQuery,
  sucursalBody,
} from '../../../../src/modules/sucursales/sucursales.schemas.js';

const valido = {
  nombre: 'Sucursal Zona 10',
  telefono: '2222-3333',
  linea1: '6a. avenida 12-34, zona 10',
  municipio: 'Guatemala',
  departamento: 'Guatemala',
};

describe('sucursalBody', () => {
  it('PUT sin opcionales: linea2, codigoPostal y horario quedan en null', () => {
    // Act
    const resultado = sucursalBody.parse(valido);

    // Assert
    expect(resultado).toEqual({ ...valido, linea2: null, codigoPostal: null, horario: null });
  });

  it('recorta espacios y convierte opcionales vacíos en null', () => {
    // Act
    const resultado = sucursalBody.parse({
      ...valido,
      nombre: '  Sucursal Mixco  ',
      linea2: '   ',
      codigoPostal: '',
      horario: ' Lun-Vie 9-17 ',
    });

    // Assert
    expect(resultado).toMatchObject({
      nombre: 'Sucursal Mixco',
      linea2: null,
      codigoPostal: null,
      horario: 'Lun-Vie 9-17',
    });
  });

  it('acepta un código postal de 5 dígitos', () => {
    // Act
    const resultado = sucursalBody.safeParse({ ...valido, codigoPostal: '01010' });

    // Assert
    expect(resultado.success).toBe(true);
  });

  it.each([
    ['teléfono con letras', { telefono: '2222-abcd' }],
    ['teléfono demasiado corto', { telefono: '1234567' }],
    ['sin teléfono', { telefono: undefined }],
    ['código postal de 4 dígitos', { codigoPostal: '0101' }],
    ['código postal de 6 dígitos', { codigoPostal: '010101' }],
    ['código postal con letras', { codigoPostal: '0101a' }],
    ['nombre vacío', { nombre: '   ' }],
    ['nombre de más de 100 caracteres', { nombre: 'a'.repeat(101) }],
    ['línea 1 de más de 200 caracteres', { linea1: 'a'.repeat(201) }],
    ['municipio vacío', { municipio: '' }],
    ['departamento de más de 100 caracteres', { departamento: 'a'.repeat(101) }],
    ['horario de más de 200 caracteres', { horario: 'a'.repeat(201) }],
    ['línea 2 de más de 200 caracteres', { linea2: 'a'.repeat(201) }],
  ])('rechaza %s', (_caso, cambio) => {
    // Act
    const resultado = sucursalBody.safeParse({ ...valido, ...cambio });

    // Assert
    expect(resultado.success).toBe(false);
  });
});

describe('listarSucursalesQuery', () => {
  it('sin parámetros aplica los valores por defecto', () => {
    // Act
    const resultado = listarSucursalesQuery.parse({});

    // Assert
    expect(resultado).toEqual({ page: 1, pageSize: 20, sort: 'nombre:asc' });
  });

  it('convierte activo y q', () => {
    // Act
    const resultado = listarSucursalesQuery.parse({ q: ' zona ', activo: 'false' });

    // Assert
    expect(resultado).toMatchObject({ q: 'zona', activo: false });
  });

  it('acepta ordenar por cantidadPedidos', () => {
    // Act
    const resultado = listarSucursalesQuery.safeParse({ sort: 'cantidadPedidos:desc' });

    // Assert
    expect(resultado.success).toBe(true);
  });

  it.each([
    ['sort fuera de la lista blanca', { sort: 'telefono:asc' }],
    ['sort sin dirección', { sort: 'nombre' }],
    ['activo no booleano', { activo: 'si' }],
    ['page 0', { page: '0' }],
    ['pageSize mayor a 100', { pageSize: '101' }],
    ['q de más de 100 caracteres', { q: 'a'.repeat(101) }],
  ])('rechaza %s', (_caso, query) => {
    // Act
    const resultado = listarSucursalesQuery.safeParse(query);

    // Assert
    expect(resultado.success).toBe(false);
  });
});

describe('estadoSucursalBody', () => {
  it.each([true, false])('acepta activo: %s', (activo) => {
    // Act
    const resultado = estadoSucursalBody.safeParse({ activo });

    // Assert
    expect(resultado.success).toBe(true);
  });

  it.each([
    ['cadena', { activo: 'true' }],
    ['número', { activo: 1 }],
    ['ausente', {}],
  ])('rechaza activo %s', (_caso, cuerpo) => {
    // Act
    const resultado = estadoSucursalBody.safeParse(cuerpo);

    // Assert
    expect(resultado.success).toBe(false);
  });
});
