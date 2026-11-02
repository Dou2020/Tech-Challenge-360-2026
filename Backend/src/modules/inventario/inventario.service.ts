import { aIso, rangoFechas } from '../../shared/utils/fechas.js';
import { aMonto } from '../../shared/utils/montos.js';
import {
  respuestaPaginada,
  type Paginacion,
  type RespuestaPaginada,
} from '../../shared/utils/paginacion.js';
import { inventarioRepository } from './inventario.repository.js';
import type {
  DatosAjuste,
  DatosEntrada,
  Existencia,
  FilaExistencia,
  FilaMovimiento,
  FilaMovimientoRegistrado,
  FiltrosExistencias,
  FiltrosKardex,
  FiltrosKardexSp,
  Movimiento,
  MovimientoRegistrado,
  ResultadoLiberacion,
  TipoMovimiento,
} from './inventario.types.js';

/*
 * Nada de este módulo se cachea: todo trae existencias, que nunca salen de Redis.
 * Las entradas y los ajustes tampoco invalidan la caché del catálogo: lo cacheado (categorías
 * visibles y su cantidad de productos, métodos de envío) no depende de la existencia.
 */

/**
 * IDMovimientoInventario es BIGINT y el driver lo entrega como string. En JSON va como number:
 * una identidad que avanza de uno en uno no llega a 2^53. Si llegara, se falla en lugar de
 * devolver un id redondeado.
 */
export function aIdMovimiento(valor: string | number): number {
  const id = Number(valor);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`IDMovimientoInventario fuera del rango seguro de JavaScript: ${valor}`);
  }
  return id;
}

/** Fechas del query → parámetros del SP: un día completo de Guatemala o instantes UTC. */
export function aFiltrosKardexSp({ desde, hasta, tipo }: FiltrosKardex): FiltrosKardexSp {
  return { ...rangoFechas(desde, hasta), tipo: tipo ?? null };
}

function aExistencia(fila: FilaExistencia): Existencia {
  return {
    idVariante: fila.IDVariante,
    sku: fila.SKU,
    idProducto: fila.IDProducto,
    producto: fila.Producto,
    idCategoria: fila.IDCategoria,
    categoria: fila.Categoria,
    descripcion: fila.Descripcion,
    precio: aMonto(fila.Precio),
    existenciaFisica: fila.ExistenciaFisica,
    existenciaReservada: fila.ExistenciaReservada,
    existenciaDisponible: fila.ExistenciaDisponible,
    bajoStock: Boolean(fila.BajoStock),
    umbralBajoStock: fila.UmbralBajoStock,
    activo: Boolean(fila.Activo),
    productoActivo: Boolean(fila.ProductoActivo),
    categoriaActiva: Boolean(fila.CategoriaActiva),
  };
}

export function aMovimiento(fila: FilaMovimiento): Movimiento {
  return {
    idMovimientoInventario: aIdMovimiento(fila.IDMovimientoInventario),
    idVariante: fila.IDVariante,
    fecha: aIso(fila.Fecha),
    codigoTipoMovimiento: fila.CodigoTipoMovimiento,
    nombreTipoMovimiento: fila.NombreTipoMovimiento,
    signo: fila.Signo,
    cantidad: fila.Cantidad,
    existenciaAnterior: fila.ExistenciaAnterior,
    existenciaNueva: fila.ExistenciaNueva,
    motivo: fila.Motivo,
    idUsuario: fila.IDUsuario,
    usuario: fila.Usuario,
    idPedido: fila.IDPedido,
    numeroPedido: fila.NumeroPedido,
    idDevolucion: fila.IDDevolucion,
  };
}

function aMovimientoRegistrado(fila: FilaMovimientoRegistrado): MovimientoRegistrado {
  return {
    ...aMovimiento(fila),
    sku: fila.SKU,
    existenciaFisica: fila.ExistenciaFisica,
    existenciaReservada: fila.ExistenciaReservada,
    existenciaDisponible: fila.ExistenciaDisponible,
  };
}

export const inventarioService = {
  async listarTiposMovimiento(): Promise<TipoMovimiento[]> {
    return (await inventarioRepository.listarTiposMovimiento()).map((fila) => ({
      idTipoMovimientoInventario: fila.IDTipoMovimientoInventario,
      codigo: fila.Codigo,
      nombre: fila.Nombre,
      signo: fila.Signo,
    }));
  },

  async listarExistencias(
    filtros: FiltrosExistencias,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<Existencia>> {
    const resultado = await inventarioRepository.listarExistencias(filtros, paginacion);
    return respuestaPaginada(resultado, paginacion, aExistencia);
  },

  async consultarKardex(
    idVariante: number,
    filtros: FiltrosKardex,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<Movimiento>> {
    const resultado = await inventarioRepository.consultarKardex(
      idVariante,
      aFiltrosKardexSp(filtros),
      paginacion,
    );
    return respuestaPaginada(resultado, paginacion, aMovimiento);
  },

  async registrarEntrada(idUsuario: number, datos: DatosEntrada): Promise<MovimientoRegistrado> {
    return aMovimientoRegistrado(await inventarioRepository.registrarEntrada(idUsuario, datos));
  },

  async registrarAjuste(idUsuario: number, datos: DatosAjuste): Promise<MovimientoRegistrado> {
    return aMovimientoRegistrado(await inventarioRepository.registrarAjuste(idUsuario, datos));
  },

  /** Lo ejecuta jobs/liberarReservas.job.ts. */
  async liberarReservasVencidas(): Promise<ResultadoLiberacion> {
    const fila = await inventarioRepository.liberarReservasVencidas();
    return {
      reservasLiberadas: fila.ReservasLiberadas,
      unidadesLiberadas: fila.UnidadesLiberadas,
      variantesAfectadas: fila.VariantesAfectadas,
    };
  },
};
