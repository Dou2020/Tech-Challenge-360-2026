import sql from 'mssql';
import { executeSp, type ResultadoSp } from '../../db/executeSp.js';
import { parametrosPaginacion, type Paginacion } from '../../shared/utils/paginacion.js';
import type { FilaBitacora, FilaModulo, FiltrosBitacoraSp } from './bitacora.types.js';

/** Solo lectura: la bitácora la escriben los SPs, nunca un endpoint. */
export const bitacoraRepository = {
  /** Filtros por igualdad; @Desde y @Hasta son instantes UTC inclusive. 50001 si desde > hasta. */
  listar(filtros: FiltrosBitacoraSp, paginacion: Paginacion): Promise<ResultadoSp<FilaBitacora>> {
    return executeSp<FilaBitacora>('SP_Bitacora_Listar', [
      { nombre: 'Modulo', tipo: sql.NVarChar(50), valor: filtros.modulo },
      { nombre: 'Entidad', tipo: sql.NVarChar(50), valor: filtros.entidad },
      { nombre: 'IDRegistro', tipo: sql.Int, valor: filtros.idRegistro },
      { nombre: 'IDUsuario', tipo: sql.Int, valor: filtros.idUsuario },
      { nombre: 'Accion', tipo: sql.NVarChar(20), valor: filtros.accion },
      { nombre: 'Desde', tipo: sql.DateTime2(3), valor: filtros.desde },
      { nombre: 'Hasta', tipo: sql.DateTime2(3), valor: filtros.hasta },
      ...parametrosPaginacion(paginacion),
    ]);
  },

  /** Módulos con registros, alfabético. */
  async listarModulos(): Promise<FilaModulo[]> {
    const { filas } = await executeSp<FilaModulo>('SP_Bitacora_ListarModulos');
    return filas;
  },
};
