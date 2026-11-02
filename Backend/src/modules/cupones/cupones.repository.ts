import sql from 'mssql';
import { executeSp, type ParametroSp } from '../../db/executeSp.js';
import {
  parametrosPaginacion,
  respuestaPaginada,
  type Paginacion,
  type RespuestaPaginada,
} from '../../shared/utils/paginacion.js';
import type { DatosCupon, FilaCupon, FilaUsoCupon, FiltrosCupones } from './cupones.types.js';

/*
 * Bitácora (Modulo 'Cupones') la escribe cada SP que modifica, en la misma transacción.
 * Errores: 50001 validación → 400; 50004 inexistente → 404; 50051 en uso → 409; 2627 código
 * repetido → 409 DUPLICADO (lo traduce executeSp); 50012 solicitante desactivado.
 */

const solicitante = (idUsuario: number): ParametroSp => ({
  nombre: 'IDUsuarioSolicitante',
  tipo: sql.Int,
  valor: idUsuario,
});

const cupon = (idCupon: number): ParametroSp => ({
  nombre: 'IDCupon',
  tipo: sql.Int,
  valor: idCupon,
});

/** Campos de SP_Cupones_Crear y _Actualizar; el SP guarda el código en mayúsculas. */
const campos = (d: DatosCupon): ParametroSp[] => [
  { nombre: 'Codigo', tipo: sql.NVarChar(100), valor: d.codigo },
  { nombre: 'Descripcion', tipo: sql.NVarChar(300), valor: d.descripcion },
  { nombre: 'TipoDescuento', tipo: sql.NVarChar(20), valor: d.tipoDescuento },
  { nombre: 'Valor', tipo: sql.Decimal(12, 2), valor: d.valor },
  { nombre: 'IDCategoria', tipo: sql.Int, valor: d.idCategoria },
  { nombre: 'MontoMinimo', tipo: sql.Decimal(12, 2), valor: d.montoMinimo },
  { nombre: 'FechaInicio', tipo: sql.DateTime2(3), valor: d.fechaInicio },
  { nombre: 'FechaFin', tipo: sql.DateTime2(3), valor: d.fechaFin },
  { nombre: 'LimiteUsosTotal', tipo: sql.Int, valor: d.limiteUsosTotal },
  { nombre: 'LimiteUsosPorCliente', tipo: sql.Int, valor: d.limiteUsosPorCliente },
];

async function unaFila(
  sp:
    | 'SP_Cupones_ObtenerPorId'
    | 'SP_Cupones_Crear'
    | 'SP_Cupones_Actualizar'
    | 'SP_Cupones_CambiarEstado',
  parametros: ParametroSp[],
): Promise<FilaCupon> {
  const { filas } = await executeSp<FilaCupon>(sp, parametros);
  const fila = filas[0];
  if (!fila) throw new Error(`${sp} no devolvió filas`);
  return fila;
}

export const cuponesRepository = {
  async listar(
    filtros: FiltrosCupones,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<FilaCupon>> {
    const resultado = await executeSp<FilaCupon>('SP_Cupones_Listar', [
      { nombre: 'Texto', tipo: sql.NVarChar(100), valor: filtros.q ?? null },
      { nombre: 'Activo', tipo: sql.Bit, valor: filtros.activo ?? null },
      { nombre: 'Vigente', tipo: sql.Bit, valor: filtros.vigente ?? null },
      ...parametrosPaginacion(paginacion),
    ]);
    return respuestaPaginada(resultado, paginacion);
  },

  obtener: (idCupon: number) => unaFila('SP_Cupones_ObtenerPorId', [cupon(idCupon)]),

  crear: (idUsuario: number, datos: DatosCupon) =>
    unaFila('SP_Cupones_Crear', [solicitante(idUsuario), ...campos(datos)]),

  actualizar: (idUsuario: number, idCupon: number, datos: DatosCupon) =>
    unaFila('SP_Cupones_Actualizar', [solicitante(idUsuario), cupon(idCupon), ...campos(datos)]),

  cambiarEstado: (idUsuario: number, idCupon: number, activo: boolean) =>
    unaFila('SP_Cupones_CambiarEstado', [
      solicitante(idUsuario),
      cupon(idCupon),
      { nombre: 'Activo', tipo: sql.Bit, valor: activo },
    ]),

  async eliminar(idUsuario: number, idCupon: number): Promise<void> {
    await executeSp('SP_Cupones_Eliminar', [solicitante(idUsuario), cupon(idCupon)]);
  },

  async listarUsos(
    idCupon: number,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<FilaUsoCupon>> {
    const resultado = await executeSp<FilaUsoCupon>('SP_Cupones_ListarUsos', [
      cupon(idCupon),
      ...parametrosPaginacion(paginacion),
    ]);
    return respuestaPaginada(resultado, paginacion);
  },
};
