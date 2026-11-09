import { cache } from '../../shared/cache/cache.js';
import { eventos, type TipoEventoPedido } from '../../shared/eventos/eventos.js';
import { aIso, rangoFechas } from '../../shared/utils/fechas.js';
import { aMonto } from '../../shared/utils/montos.js';
import {
  respuestaPaginada,
  type Paginacion,
  type RespuestaPaginada,
} from '../../shared/utils/paginacion.js';
import { pedidosRepository } from './pedidos.repository.js';
import type {
  CambioEstado,
  Devolucion,
  DevolucionRegistrada,
  EstadosPedido,
  FilaPedidoListado,
  LineaDevolucion,
  PedidoDetalle,
  PedidoResumen,
  ResultadoDetallePedidoSp,
} from './pedidos.types.js';

/*
 * El estado, la existencia, el cupón y el reembolso los decide cada SP en su transacción.
 * Nada de este módulo se cachea. Cancelar, cambiar el estado y registrar una devolución cambian
 * lo que cuentan los reportes: se invalida su caché después de que el SP confirmó.
 */

function aResumen(f: FilaPedidoListado): PedidoResumen {
  return {
    idPedido: f.IDPedido,
    numeroPedido: f.NumeroPedido,
    idUsuario: f.IDUsuario,
    cliente: f.Cliente,
    correoCliente: f.CorreoCliente,
    estado: f.Estado,
    nombreEstado: f.NombreEstado,
    subtotal: aMonto(f.Subtotal),
    descuento: aMonto(f.Descuento),
    costoEnvio: aMonto(f.CostoEnvio),
    total: aMonto(f.Total),
    cantidadLineas: f.CantidadLineas,
    cantidadUnidades: f.CantidadUnidades,
    fechaCreacion: aIso(f.FechaCreacion),
  };
}

/** Ensambla los 3 result sets: pedido, líneas congeladas y transiciones posibles. */
/**
 * Invalida los reportes y avisa a los dashboards abiertos, en ese orden: así la petición
 * que dispare el aviso responde MISS con datos frescos. Devuelve el mismo `pedido`.
 */
async function invalidarYAvisar<T extends { idPedido: number; estado: string }>(
  tipo: TipoEventoPedido,
  pedido: T,
): Promise<T> {
  await cache.invalidar('reportes');
  await eventos.publicar({
    tipo,
    idPedido: pedido.idPedido,
    estado: pedido.estado,
    fecha: new Date().toISOString(),
  });
  return pedido;
}

export function armarDetalle({
  pedido: p,
  lineas,
  transiciones,
}: ResultadoDetallePedidoSp): PedidoDetalle {
  return {
    idPedido: p.IDPedido,
    numeroPedido: p.NumeroPedido,
    idUsuario: p.IDUsuario,
    cliente: p.Cliente,
    correoCliente: p.CorreoCliente,
    estado: p.Estado,
    nombreEstado: p.NombreEstado,
    esFinal: Boolean(p.EsFinal),
    direccion: { idDireccion: p.IDDireccion, entrega: p.DireccionEntrega },
    retiroEnSucursal: Boolean(p.RetiroEnSucursal),
    sucursal:
      p.IDSucursal === null || p.IDSucursal === undefined
        ? null
        : { idSucursal: p.IDSucursal, nombre: p.Sucursal ?? '' },
    metodoEnvio: {
      idMetodoEnvio: p.IDMetodoEnvio,
      nombre: p.MetodoEnvio,
      diasEstimados: p.DiasEstimados,
    },
    cupon: p.IDCupon === null ? null : { idCupon: p.IDCupon, codigo: p.CodigoCupon ?? '' },
    subtotal: aMonto(p.Subtotal),
    descuento: aMonto(p.Descuento),
    costoEnvio: aMonto(p.CostoEnvio),
    montoIVA: aMonto(p.MontoIVA),
    total: aMonto(p.Total),
    montoReembolsado: aMonto(p.MontoReembolsado),
    pago: {
      idPago: p.IDPago,
      metodoPago: p.MetodoPago,
      monto: aMonto(p.MontoPago),
      estado: p.EstadoPago,
      referencia: p.ReferenciaTransaccion,
      fecha: aIso(p.FechaPago),
    },
    fechaCreacion: aIso(p.FechaCreacion),
    lineas: lineas.map((l) => ({
      idPedidoDetalle: l.IDPedidoDetalle,
      idVariante: l.IDVariante,
      sku: l.SKU,
      nombreProducto: l.NombreProducto,
      variante: l.DescripcionVariante,
      cantidad: l.Cantidad,
      precioUnitario: aMonto(l.PrecioUnitario),
      descuentoLinea: aMonto(l.DescuentoLinea),
      subtotal: aMonto(l.Subtotal),
      cantidadDevuelta: l.CantidadDevuelta,
      cantidadDevolvible: l.CantidadDevolvible,
    })),
    transiciones: transiciones.map((t) => ({
      estado: t.CodigoEstado,
      nombre: t.NombreEstado,
      via: t.Via,
    })),
  };
}

export interface FiltrosPedidos {
  estado?: string | undefined;
  idCliente?: number | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
  q?: string | undefined;
}

export const pedidosService = {
  /** Un Cliente solo ve los suyos: el SP ignora `idCliente` para ese rol. */
  async listar(
    idUsuario: number,
    filtros: FiltrosPedidos,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<PedidoResumen>> {
    const resultado = await pedidosRepository.listar(
      idUsuario,
      {
        estado: filtros.estado ?? null,
        idCliente: filtros.idCliente ?? null,
        ...rangoFechas(filtros.desde, filtros.hasta),
        q: filtros.q ?? null,
      },
      paginacion,
    );
    return respuestaPaginada(resultado, paginacion, aResumen);
  },

  async listarEstados(idUsuario: number): Promise<EstadosPedido> {
    const { estados, transiciones } = await pedidosRepository.listarTransiciones(idUsuario);
    return {
      estados: estados.map((e) => ({
        codigo: e.Codigo,
        nombre: e.Nombre,
        esFinal: Boolean(e.EsFinal),
      })),
      transiciones: transiciones.map((t) => ({
        origen: t.CodigoOrigen,
        destino: t.CodigoDestino,
        rol: t.Rol,
        permitida: Boolean(t.PermitidaParaSolicitante),
        via: t.Via,
      })),
    };
  },

  async obtener(idUsuario: number, idPedido: number): Promise<PedidoDetalle> {
    return armarDetalle(await pedidosRepository.obtenerPorId(idUsuario, idPedido));
  },

  async historial(idUsuario: number, idPedido: number): Promise<CambioEstado[]> {
    const filas = await pedidosRepository.obtenerHistorial(idUsuario, idPedido);
    return filas.map((f) => ({
      idHistorialEstadoPedido: f.IDHistorialEstadoPedido,
      idPedido: f.IDPedido,
      estadoAnterior:
        f.CodigoEstadoAnterior === null
          ? null
          : { codigo: f.CodigoEstadoAnterior, nombre: f.EstadoAnterior ?? '' },
      estadoNuevo: { codigo: f.CodigoEstadoNuevo, nombre: f.EstadoNuevo },
      idUsuario: f.IDUsuario,
      usuario: f.Usuario,
      comentario: f.Comentario,
      fecha: aIso(f.Fecha),
    }));
  },

  async listarDevoluciones(idUsuario: number, idPedido: number): Promise<Devolucion[]> {
    const { devoluciones, lineas } = await pedidosRepository.listarDevoluciones(
      idUsuario,
      idPedido,
    );
    return devoluciones.map((d) => ({
      idDevolucion: d.IDDevolucion,
      idPedido: d.IDPedido,
      tipo: d.Tipo,
      motivo: d.Motivo,
      montoReembolso: aMonto(d.MontoReembolso),
      idUsuario: d.IDUsuario,
      usuario: d.Usuario,
      fecha: aIso(d.Fecha),
      lineas: lineas
        .filter((l) => l.IDDevolucion === d.IDDevolucion)
        .map((l) => ({
          idDevolucionDetalle: l.IDDevolucionDetalle,
          idPedidoDetalle: l.IDPedidoDetalle,
          sku: l.SKU,
          nombreProducto: l.NombreProducto,
          variante: l.DescripcionVariante,
          cantidad: l.Cantidad,
          montoReembolso: aMonto(l.MontoReembolso),
        })),
    }));
  },

  async cancelar(
    idUsuario: number,
    idPedido: number,
    motivo: string | null,
  ): Promise<PedidoDetalle> {
    const resultado = await pedidosRepository.cancelar(idUsuario, idPedido, motivo);
    return invalidarYAvisar('CANCELADO', armarDetalle(resultado));
  },

  async cambiarEstado(
    idUsuario: number,
    idPedido: number,
    estado: string,
    comentario: string | null,
  ): Promise<PedidoDetalle> {
    const resultado = await pedidosRepository.cambiarEstado(
      idUsuario,
      idPedido,
      estado,
      comentario,
    );
    return invalidarYAvisar('ESTADO', armarDetalle(resultado));
  },

  async registrarDevolucion(
    idUsuario: number,
    idPedido: number,
    motivo: string,
    lineas: LineaDevolucion[],
  ): Promise<DevolucionRegistrada> {
    const f = await pedidosRepository.registrarDevolucion(idUsuario, idPedido, motivo, lineas);
    await invalidarYAvisar('DEVOLUCION', { idPedido: f.IDPedido, estado: f.EstadoPedido });
    return {
      idDevolucion: f.IDDevolucion,
      idPedido: f.IDPedido,
      tipo: f.Tipo,
      montoReembolso: aMonto(f.MontoReembolso),
      motivo: f.Motivo,
      estadoPedido: f.EstadoPedido,
      fecha: aIso(f.Fecha),
    };
  },
};
