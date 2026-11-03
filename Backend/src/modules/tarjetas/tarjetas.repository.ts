import sql from 'mssql';
import { executeSp, type ParametroSp, type ResultadoSp } from '../../db/executeSp.js';
import type { DatosTarjeta, FilaTarjeta } from './tarjetas.types.js';

/*
 * Todos filtran por @IDUsuarioSolicitante (del JWT): la tarjeta ajena y la inexistente responden
 * igual, 50004 → 404. Las escrituras pueden lanzar además 50001 (rol no Cliente), 50012
 * (solicitante inactivo), 50020 (últimos 4 = 0000, PAGO_RECHAZADO) y 2627 (repetida, DUPLICADO).
 */

const solicitante = (idUsuario: number): ParametroSp => ({
  nombre: 'IDUsuarioSolicitante',
  tipo: sql.Int,
  valor: idUsuario,
});

const tarjeta = (idTarjeta: number): ParametroSp => ({
  nombre: 'IDTarjetaGuardada',
  tipo: sql.Int,
  valor: idTarjeta,
});

function primeraFila<T>(resultado: ResultadoSp<T>, sp: string): T {
  const fila = resultado.filas[0];
  if (!fila) throw new Error(`${sp} no devolvió filas`);
  return fila;
}

export const tarjetasRepository = {
  /** Predeterminada primero y luego de la más reciente a la más antigua. */
  async listar(idUsuario: number): Promise<FilaTarjeta[]> {
    const { filas } = await executeSp<FilaTarjeta>('SP_Tarjetas_Listar', [solicitante(idUsuario)]);
    return filas;
  },

  async crear(idUsuario: number, datos: DatosTarjeta): Promise<FilaTarjeta> {
    const resultado = await executeSp<FilaTarjeta>('SP_Tarjetas_Crear', [
      solicitante(idUsuario),
      { nombre: 'Titular', tipo: sql.NVarChar(150), valor: datos.titular },
      { nombre: 'Ultimos4', tipo: sql.Char(4), valor: datos.ultimos4 },
      { nombre: 'Tipo', tipo: sql.NVarChar(10), valor: datos.tipo },
      { nombre: 'Marca', tipo: sql.NVarChar(20), valor: datos.marca },
      { nombre: 'Predeterminada', tipo: sql.Bit, valor: datos.predeterminada },
    ]);
    return primeraFila(resultado, 'SP_Tarjetas_Crear');
  },

  async marcarPredeterminada(idUsuario: number, idTarjeta: number): Promise<FilaTarjeta> {
    const resultado = await executeSp<FilaTarjeta>('SP_Tarjetas_MarcarPredeterminada', [
      solicitante(idUsuario),
      tarjeta(idTarjeta),
    ]);
    return primeraFila(resultado, 'SP_Tarjetas_MarcarPredeterminada');
  },

  /** Borrado físico; si era la predeterminada, el SP promueve la más reciente. */
  async eliminar(idUsuario: number, idTarjeta: number): Promise<void> {
    await executeSp('SP_Tarjetas_Eliminar', [solicitante(idUsuario), tarjeta(idTarjeta)]);
  },
};
