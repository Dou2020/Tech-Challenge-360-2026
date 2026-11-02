import { describe, expect, it } from 'vitest';
import { mapSqlError } from '../../../src/db/sqlErrorMapper.js';
import { AppError } from '../../../src/shared/errors/AppError.js';

describe('mapSqlError', () => {
  it('traduce un THROW de negocio al código y status del catálogo, con el mensaje del SP', () => {
    const resultado = mapSqlError({ number: 50030, message: 'Solo hay 1 unidad disponible.' });

    expect(resultado).toBeInstanceOf(AppError);
    expect(resultado).toMatchObject({
      code: 'STOCK_INSUFICIENTE',
      status: 409,
      message: 'Solo hay 1 unidad disponible.',
    });
  });

  it('traduce los errores de los triggers', () => {
    expect(mapSqlError({ number: 50040, message: 'x' })).toMatchObject({
      code: 'TRANSICION_NO_PERMITIDA',
      status: 409,
    });
    expect(mapSqlError({ number: 50070, message: 'x' })).toMatchObject({
      code: 'BITACORA_INMUTABLE',
    });
  });

  it.each([2627, 2601])('traduce la violación de UNIQUE %i a DUPLICADO', (numero) => {
    expect(mapSqlError({ number: numero, message: 'Violation of UNIQUE KEY' })).toMatchObject({
      code: 'DUPLICADO',
      status: 409,
    });
  });

  // 1205: deadlock. 547: violación de FK o CHECK, que solo llega si un SP no validó antes.
  it.each([1205, 547])('deja sin traducir el error SQL %i (termina como 500)', (numero) => {
    const original = { number: numero, message: 'Error de SQL Server' };
    expect(mapSqlError(original)).toBe(original);
  });

  it('devuelve sin cambios un error que no es de SQL Server', () => {
    const original = new Error('timeout');
    expect(mapSqlError(original)).toBe(original);
  });
});
