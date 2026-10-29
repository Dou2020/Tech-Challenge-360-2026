import { AppError } from '../shared/errors/AppError.js';
import { CODIGO_POR_THROW } from '../shared/errors/codigos.js';

const VIOLACION_UNIQUE = new Set([2627, 2601]);

interface ErrorSql {
  number?: number;
  message: string;
}

function esErrorSql(error: unknown): error is ErrorSql {
  return (
    typeof error === 'object' &&
    error !== null &&
    'number' in error &&
    typeof (error as { number: unknown }).number === 'number'
  );
}

/**
 * Traduce un error de SQL Server a un AppError:
 *  - THROW 50xxx de un SP → código del catálogo, con el mensaje del SP.
 *  - Violación de UNIQUE (2627/2601) → DUPLICADO.
 * Cualquier otro error se devuelve sin cambios para que termine como 500. Eso incluye 547
 * (violación de FK o CHECK): los SPs validan antes de escribir y responden con su código de
 * negocio, así que un 547 significa que un SP omitió una validación.
 */
export function mapSqlError(error: unknown): unknown {
  if (!esErrorSql(error) || error.number === undefined) return error;

  const codigo = CODIGO_POR_THROW.get(error.number);
  if (codigo) return new AppError(codigo, error.message);

  if (VIOLACION_UNIQUE.has(error.number)) {
    return new AppError('DUPLICADO', 'Ya existe un registro con ese valor.');
  }

  return error;
}
