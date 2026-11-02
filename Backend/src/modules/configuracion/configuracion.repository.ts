import sql from 'mssql';
import { executeSp } from '../../db/executeSp.js';
import type { FilaConfiguracion } from './configuracion.types.js';

export const configuracionRepository = {
  /** Por Clave. */
  async listar(): Promise<FilaConfiguracion[]> {
    const { filas } = await executeSp<FilaConfiguracion>('SP_Configuracion_Listar');
    return filas;
  },

  /** 50001 (valor fuera de rango o con formato inválido), 50004 (clave inexistente). Bitácora MODIFICAR. */
  async actualizar(idUsuario: number, clave: string, valor: string): Promise<FilaConfiguracion> {
    const { filas } = await executeSp<FilaConfiguracion>('SP_Configuracion_Actualizar', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: idUsuario },
      { nombre: 'Clave', tipo: sql.NVarChar(50), valor: clave },
      { nombre: 'Valor', tipo: sql.NVarChar(200), valor },
    ]);
    const fila = filas[0];
    if (!fila) throw new Error('SP_Configuracion_Actualizar no devolvió la fila');
    return fila;
  },
};
