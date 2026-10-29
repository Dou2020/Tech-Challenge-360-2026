import type sql from 'mssql';
import { getPool } from '../config/database.js';
import { mapSqlError } from './sqlErrorMapper.js';

/** Nombre de SP según el estándar: SP_Modulo_Proceso. */
export type NombreSp = `SP_${string}_${string}`;

export interface ParametroSp {
  nombre: string;
  /** Tipo de mssql: sql.Int, sql.NVarChar(150), sql.Decimal(12, 2)… */
  tipo: (() => sql.ISqlType) | sql.ISqlType;
  valor: unknown;
}

export interface ResultadoSp<T> {
  /** Primer result set del SP. */
  filas: T[];
  /** Todos los result sets, en orden. */
  resultSets: unknown[][];
  returnValue: number;
}

const PATRON_NOMBRE = /^SP_[A-Za-z]+_[A-Za-z]+$/;

/**
 * Único punto de acceso a datos del backend: ejecuta un stored procedure
 * con parámetros tipados. No acepta SQL; solo el nombre del SP.
 */
export async function executeSp<T = Record<string, unknown>>(
  nombre: NombreSp,
  parametros: readonly ParametroSp[] = [],
): Promise<ResultadoSp<T>> {
  if (!PATRON_NOMBRE.test(nombre)) {
    throw new Error(`Nombre de stored procedure inválido: ${nombre}`);
  }

  const pool = await getPool();
  const request = pool.request();
  for (const parametro of parametros) {
    request.input(parametro.nombre, parametro.tipo, parametro.valor);
  }

  try {
    const resultado = await request.execute<T>(nombre);
    const resultSets = (resultado.recordsets as unknown as unknown[][]) ?? [];
    return {
      filas: (resultSets[0] ?? []) as T[],
      resultSets,
      returnValue: resultado.returnValue as number,
    };
  } catch (error) {
    throw mapSqlError(error);
  }
}
