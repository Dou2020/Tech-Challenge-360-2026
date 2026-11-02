import sql from 'mssql';
import {
  executeSp,
  type NombreSp,
  type ParametroSp,
  type ResultadoSp,
} from '../../db/executeSp.js';
import { parametrosPaginacion, type Paginacion } from '../../shared/utils/paginacion.js';
import type {
  FilaDevolucion,
  FilaDevolucionDetalle,
  FilaDevolucionRegistrada,
  FilaEstadoPedido,
  FilaHistorialEstado,
  FilaLineaPedido,
  FilaPedido,
  FilaPedidoListado,
  FilaTransicionCatalogo,
  FilaTransicionPosible,
  FiltrosPedidosSp,
  LineaDevolucion,
  ResultadoDetallePedidoSp,
} from './pedidos.types.js';

/*
 * @IDUsuarioSolicitante sale siempre del JWT; el SP busca el rol en la base. Para un Cliente, un
 * pedido ajeno es 50004 (404). Los SPs de escritura validan además al solicitante (50004/50012).
 */

const solicitante = (idUsuario: number): ParametroSp => ({
  nombre: 'IDUsuarioSolicitante',
  tipo: sql.Int,
  valor: idUsuario,
});

const pedido = (idPedido: number): ParametroSp => ({
  nombre: 'IDPedido',
  tipo: sql.Int,
  valor: idPedido,
});

async function detalle(
  nombre: NombreSp,
  parametros: ParametroSp[],
): Promise<ResultadoDetallePedidoSp> {
  const { resultSets } = await executeSp(nombre, parametros);
  const fila = resultSets[0]?.[0] as FilaPedido | undefined;
  if (!fila) throw new Error(`${nombre} no devolvió el pedido`);
  return {
    pedido: fila,
    lineas: (resultSets[1] ?? []) as FilaLineaPedido[],
    transiciones: (resultSets[2] ?? []) as FilaTransicionPosible[],
  };
}

export const pedidosRepository = {
  listar(
    idUsuario: number,
    filtros: FiltrosPedidosSp,
    paginacion: Paginacion,
  ): Promise<ResultadoSp<FilaPedidoListado>> {
    return executeSp<FilaPedidoListado>('SP_Pedidos_Listar', [
      solicitante(idUsuario),
      { nombre: 'Estado', tipo: sql.NVarChar(30), valor: filtros.estado },
      { nombre: 'IDCliente', tipo: sql.Int, valor: filtros.idCliente },
      { nombre: 'Desde', tipo: sql.DateTime2(3), valor: filtros.desde },
      { nombre: 'Hasta', tipo: sql.DateTime2(3), valor: filtros.hasta },
      { nombre: 'Texto', tipo: sql.NVarChar(50), valor: filtros.q },
      ...parametrosPaginacion(paginacion),
    ]);
  },

  async listarTransiciones(
    idUsuario: number,
  ): Promise<{ estados: FilaEstadoPedido[]; transiciones: FilaTransicionCatalogo[] }> {
    const { resultSets } = await executeSp('SP_Pedidos_ListarTransiciones', [
      solicitante(idUsuario),
    ]);
    return {
      estados: (resultSets[0] ?? []) as FilaEstadoPedido[],
      transiciones: (resultSets[1] ?? []) as FilaTransicionCatalogo[],
    };
  },

  obtenerPorId: (idUsuario: number, idPedido: number) =>
    detalle('SP_Pedidos_ObtenerPorId', [solicitante(idUsuario), pedido(idPedido)]),

  async obtenerHistorial(idUsuario: number, idPedido: number): Promise<FilaHistorialEstado[]> {
    const { filas } = await executeSp<FilaHistorialEstado>('SP_Pedidos_ObtenerHistorialEstados', [
      solicitante(idUsuario),
      pedido(idPedido),
    ]);
    return filas;
  },

  async listarDevoluciones(
    idUsuario: number,
    idPedido: number,
  ): Promise<{ devoluciones: FilaDevolucion[]; lineas: FilaDevolucionDetalle[] }> {
    const { resultSets } = await executeSp('SP_Pedidos_ListarDevoluciones', [
      solicitante(idUsuario),
      pedido(idPedido),
    ]);
    return {
      devoluciones: (resultSets[0] ?? []) as FilaDevolucion[],
      lineas: (resultSets[1] ?? []) as FilaDevolucionDetalle[],
    };
  },

  /** 50040 si el rol no puede esa transición, el estado no cambia o el destino es CANCELADO/DEVUELTO*. */
  cambiarEstado: (
    idUsuario: number,
    idPedido: number,
    codigoEstado: string,
    comentario: string | null,
  ) =>
    detalle('SP_Pedidos_CambiarEstado', [
      solicitante(idUsuario),
      pedido(idPedido),
      { nombre: 'CodigoEstado', tipo: sql.NVarChar(30), valor: codigoEstado },
      { nombre: 'Comentario', tipo: sql.NVarChar(300), valor: comentario },
    ]),

  cancelar: (idUsuario: number, idPedido: number, motivo: string | null) =>
    detalle('SP_Pedidos_Cancelar', [
      solicitante(idUsuario),
      pedido(idPedido),
      { nombre: 'Motivo', tipo: sql.NVarChar(300), valor: motivo },
    ]),

  /** `lineas` viaja como JSON en @Lineas. 50041 si una cantidad excede lo vendido menos lo devuelto. */
  async registrarDevolucion(
    idUsuario: number,
    idPedido: number,
    motivo: string,
    lineas: LineaDevolucion[],
  ): Promise<FilaDevolucionRegistrada> {
    const { filas } = await executeSp<FilaDevolucionRegistrada>('SP_Pedidos_RegistrarDevolucion', [
      solicitante(idUsuario),
      pedido(idPedido),
      { nombre: 'Motivo', tipo: sql.NVarChar(300), valor: motivo },
      { nombre: 'Lineas', tipo: sql.NVarChar(sql.MAX), valor: JSON.stringify(lineas) },
    ]);
    const fila = filas[0];
    if (!fila) throw new Error('SP_Pedidos_RegistrarDevolucion no devolvió la devolución');
    return fila;
  },
};
