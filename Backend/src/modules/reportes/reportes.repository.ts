import sql from 'mssql';
import { executeSp, type ResultadoSp } from '../../db/executeSp.js';
import { parametrosPaginacion, type Paginacion } from '../../shared/utils/paginacion.js';
import type {
  Agrupacion,
  FilaCarritoAbandonado,
  FilaProductoVendido,
  FilaResumen,
  FilaVentasCategoria,
  FilaVentasPeriodo,
  RangoReporteSp,
} from './reportes.types.js';

const parametrosRango = ({ desde, hasta }: RangoReporteSp) => [
  { nombre: 'Desde', tipo: sql.Date, valor: desde },
  { nombre: 'Hasta', tipo: sql.Date, valor: hasta },
];

/** Solo lectura. Todos los SPs responden 50001 si desde > hasta. */
export const reportesRepository = {
  async resumen(rango: RangoReporteSp): Promise<FilaResumen | undefined> {
    const { filas } = await executeSp<FilaResumen>(
      'SP_Reportes_ResumenDashboard',
      parametrosRango(rango),
    );
    return filas[0];
  },

  async ventasPorPeriodo(
    agrupacion: Agrupacion,
    rango: RangoReporteSp,
  ): Promise<FilaVentasPeriodo[]> {
    const { filas } = await executeSp<FilaVentasPeriodo>('SP_Reportes_VentasPorPeriodo', [
      { nombre: 'Agrupacion', tipo: sql.NVarChar(10), valor: agrupacion },
      ...parametrosRango(rango),
    ]);
    return filas;
  },

  async ventasPorCategoria(rango: RangoReporteSp): Promise<FilaVentasCategoria[]> {
    const { filas } = await executeSp<FilaVentasCategoria>(
      'SP_Reportes_VentasPorCategoria',
      parametrosRango(rango),
    );
    return filas;
  },

  async productosMasVendidos(
    limite: number,
    rango: RangoReporteSp,
  ): Promise<FilaProductoVendido[]> {
    const { filas } = await executeSp<FilaProductoVendido>('SP_Reportes_ProductosMasVendidos', [
      { nombre: 'Limite', tipo: sql.Int, valor: limite },
      ...parametrosRango(rango),
    ]);
    return filas;
  },

  carritosAbandonados(
    rango: RangoReporteSp,
    paginacion: Paginacion,
  ): Promise<ResultadoSp<FilaCarritoAbandonado>> {
    return executeSp<FilaCarritoAbandonado>('SP_Reportes_CarritosAbandonados', [
      ...parametrosRango(rango),
      ...parametrosPaginacion(paginacion),
    ]);
  },
};
