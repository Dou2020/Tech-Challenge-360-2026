import sql from 'mssql';
import { executeSp, type ParametroSp, type ResultadoSp } from '../../db/executeSp.js';
import { parametrosPaginacion, type Paginacion } from '../../shared/utils/paginacion.js';
import type {
  DatosAjuste,
  DatosEntrada,
  FilaExistencia,
  FilaLiberacion,
  FilaMovimiento,
  FilaMovimientoRegistrado,
  FilaTipoMovimiento,
  FiltrosExistencias,
  FiltrosKardexSp,
} from './inventario.types.js';

/*
 * Las escrituras reciben @IDUsuarioSolicitante (del JWT) y, además de sus códigos, pueden lanzar
 * 50004 (solicitante inexistente) y 50012 (solicitante desactivado).
 * Los NULL de los filtros significan "sin filtro".
 */

const solicitante = (idUsuario: number): ParametroSp => ({
  nombre: 'IDUsuarioSolicitante',
  tipo: sql.Int,
  valor: idUsuario,
});

function primeraFila<T>(resultado: ResultadoSp<T>, sp: string): T {
  const fila = resultado.filas[0];
  if (!fila) throw new Error(`${sp} no devolvió filas`);
  return fila;
}

export const inventarioRepository = {
  async listarTiposMovimiento(): Promise<FilaTipoMovimiento[]> {
    const { filas } = await executeSp<FilaTipoMovimiento>('SP_Inventario_ListarTiposMovimiento');
    return filas;
  },

  /** Incluye variantes, productos y categorías inactivos. Umbral: Configuracion.UmbralBajoStock. */
  listarExistencias(
    filtros: FiltrosExistencias,
    paginacion: Paginacion,
  ): Promise<ResultadoSp<FilaExistencia>> {
    return executeSp<FilaExistencia>('SP_Inventario_ListarExistencias', [
      { nombre: 'Texto', tipo: sql.NVarChar(150), valor: filtros.q ?? null },
      { nombre: 'IDCategoria', tipo: sql.Int, valor: filtros.idCategoria ?? null },
      { nombre: 'BajoStock', tipo: sql.Bit, valor: filtros.bajoStock ?? null },
      { nombre: 'Activo', tipo: sql.Bit, valor: filtros.activo ?? null },
      ...parametrosPaginacion(paginacion),
    ]);
  },

  /**
   * 50004 si la variante no existe; 50001 si el tipo no existe o @Desde > @Hasta.
   * @Desde y @Hasta son instantes UTC, ambos inclusive.
   */
  consultarKardex(
    idVariante: number,
    filtros: FiltrosKardexSp,
    paginacion: Paginacion,
  ): Promise<ResultadoSp<FilaMovimiento>> {
    return executeSp<FilaMovimiento>('SP_Inventario_ConsultarKardex', [
      { nombre: 'IDVariante', tipo: sql.Int, valor: idVariante },
      { nombre: 'Desde', tipo: sql.DateTime2(3), valor: filtros.desde },
      { nombre: 'Hasta', tipo: sql.DateTime2(3), valor: filtros.hasta },
      { nombre: 'CodigoTipoMovimiento', tipo: sql.NVarChar(30), valor: filtros.tipo },
      ...parametrosPaginacion(paginacion),
    ]);
  },

  /** Kardex ENTRADA_COMPRA y bitácora en la misma transacción. Permite variantes inactivas. */
  async registrarEntrada(
    idUsuario: number,
    datos: DatosEntrada,
  ): Promise<FilaMovimientoRegistrado> {
    const resultado = await executeSp<FilaMovimientoRegistrado>('SP_Inventario_RegistrarEntrada', [
      solicitante(idUsuario),
      { nombre: 'IDVariante', tipo: sql.Int, valor: datos.idVariante },
      { nombre: 'Cantidad', tipo: sql.Int, valor: datos.cantidad },
      { nombre: 'Motivo', tipo: sql.NVarChar(300), valor: datos.motivo },
    ]);
    return primeraFila(resultado, 'SP_Inventario_RegistrarEntrada');
  },

  /** 50032 EXISTENCIA_NEGATIVA si una salida deja la física < 0 o < lo reservado vigente. */
  async registrarAjuste(idUsuario: number, datos: DatosAjuste): Promise<FilaMovimientoRegistrado> {
    const resultado = await executeSp<FilaMovimientoRegistrado>('SP_Inventario_RegistrarAjuste', [
      solicitante(idUsuario),
      { nombre: 'IDVariante', tipo: sql.Int, valor: datos.idVariante },
      { nombre: 'Tipo', tipo: sql.NVarChar(10), valor: datos.tipo },
      { nombre: 'Cantidad', tipo: sql.Int, valor: datos.cantidad },
      { nombre: 'Motivo', tipo: sql.NVarChar(300), valor: datos.motivo },
    ]);
    return primeraFila(resultado, 'SP_Inventario_RegistrarAjuste');
  },

  /**
   * La usa el job de reservas. Sin @Ahora: el SP toma SYSUTCDATETIME(). Siempre devuelve una
   * fila con los contadores (en 0 si no había nada vencido).
   */
  async liberarReservasVencidas(): Promise<FilaLiberacion> {
    const resultado = await executeSp<FilaLiberacion>('SP_Inventario_LiberarReservasVencidas');
    return primeraFila(resultado, 'SP_Inventario_LiberarReservasVencidas');
  },
};
