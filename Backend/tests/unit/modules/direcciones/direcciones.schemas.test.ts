import { describe, expect, it } from 'vitest';
import { direccionBody } from '../../../../src/modules/direcciones/direcciones.schemas.js';

describe('direccionBody', () => {
  const base = {
    alias: 'Casa',
    nombreDestinatario: 'Ana López',
    telefono: '5555-1234',
    linea1: '5a. avenida 10-25, zona 1',
    municipio: 'Guatemala',
    departamento: 'Guatemala',
  };

  it('los opcionales ausentes o vacíos quedan en null', () => {
    expect(direccionBody.parse({ ...base, linea2: '', codigoPostal: null })).toEqual({
      ...base,
      linea2: null,
      codigoPostal: null,
      referencias: null,
    });
  });

  it('valida teléfono y código postal de 5 dígitos', () => {
    expect(direccionBody.safeParse({ ...base, telefono: 'abc' }).success).toBe(false);
    expect(direccionBody.safeParse({ ...base, codigoPostal: '1001' }).success).toBe(false);
    expect(direccionBody.parse({ ...base, codigoPostal: '01001' }).codigoPostal).toBe('01001');
  });

  it('rechaza obligatorios vacíos', () => {
    expect(direccionBody.safeParse({ ...base, linea1: ' ' }).success).toBe(false);
    expect(direccionBody.safeParse({ ...base, municipio: undefined }).success).toBe(false);
  });
});
