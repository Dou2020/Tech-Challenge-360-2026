import { aIso } from '../../shared/utils/fechas.js';
import { aMonto } from '../../shared/utils/montos.js';
import type { Paginacion, RespuestaPaginada } from '../../shared/utils/paginacion.js';
import { cuponesRepository } from './cupones.repository.js';
import type {
  Cupon,
  DatosCupon,
  FilaCupon,
  FilaUsoCupon,
  FiltrosCupones,
  UsoCupon,
} from './cupones.types.js';

/*
 * Solo Administrador. Las reglas (código único, límites, cupón en uso) las aplican los SPs y sus
 * THROW llegan ya traducidos. Sin caché: los usos y el estado cambian con cada pedido.
 */

export function aCupon(fila: FilaCupon): Cupon {
  return {
    idCupon: fila.IDCupon,
    codigo: fila.Codigo,
    descripcion: fila.Descripcion,
    tipoDescuento: fila.TipoDescuento,
    valor: aMonto(fila.Valor),
    idCategoria: fila.IDCategoria,
    categoria: fila.Categoria,
    montoMinimo: aMonto(fila.MontoMinimo),
    fechaInicio: aIso(fila.FechaInicio),
    fechaFin: aIso(fila.FechaFin),
    limiteUsosTotal: fila.LimiteUsosTotal,
    limiteUsosPorCliente: fila.LimiteUsosPorCliente,
    usosActuales: fila.UsosActuales,
    usosDisponibles: fila.UsosDisponibles,
    activo: Boolean(fila.Activo),
    vigente: Boolean(fila.Vigente),
    agotado: Boolean(fila.Agotado),
    cantidadPedidos: fila.CantidadPedidos,
    cantidadCarritos: fila.CantidadCarritos,
    puedeEliminarse: Boolean(fila.PuedeEliminarse),
  };
}

export function aUso(fila: FilaUsoCupon): UsoCupon {
  return {
    idUsoCupon: fila.IDUsoCupon,
    idPedido: fila.IDPedido,
    numeroPedido: fila.NumeroPedido,
    idUsuario: fila.IDUsuario,
    cliente: fila.Cliente,
    correo: fila.Correo,
    descuento: aMonto(fila.Descuento),
    totalPedido: aMonto(fila.TotalPedido),
    estadoPedido: fila.EstadoPedido,
    fecha: aIso(fila.Fecha),
  };
}

export const cuponesService = {
  async listar(filtros: FiltrosCupones, paginacion: Paginacion): Promise<RespuestaPaginada<Cupon>> {
    const lista = await cuponesRepository.listar(filtros, paginacion);
    return { ...lista, items: lista.items.map(aCupon) };
  },

  async obtener(idCupon: number): Promise<Cupon> {
    return aCupon(await cuponesRepository.obtener(idCupon));
  },

  async crear(idUsuario: number, datos: DatosCupon): Promise<Cupon> {
    return aCupon(await cuponesRepository.crear(idUsuario, datos));
  },

  async actualizar(idUsuario: number, idCupon: number, datos: DatosCupon): Promise<Cupon> {
    return aCupon(await cuponesRepository.actualizar(idUsuario, idCupon, datos));
  },

  async cambiarEstado(idUsuario: number, idCupon: number, activo: boolean): Promise<Cupon> {
    return aCupon(await cuponesRepository.cambiarEstado(idUsuario, idCupon, activo));
  },

  async eliminar(idUsuario: number, idCupon: number): Promise<void> {
    await cuponesRepository.eliminar(idUsuario, idCupon);
  },

  async listarUsos(idCupon: number, paginacion: Paginacion): Promise<RespuestaPaginada<UsoCupon>> {
    const lista = await cuponesRepository.listarUsos(idCupon, paginacion);
    return { ...lista, items: lista.items.map(aUso) };
  },
};
