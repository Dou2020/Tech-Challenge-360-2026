import { CODIGO_POR_THROW } from '../../shared/errors/codigos.js';
import { AppError } from '../../shared/errors/AppError.js';
import { aIso } from '../../shared/utils/fechas.js';
import { aMonto } from '../../shared/utils/montos.js';
import { carritoRepository } from './carrito.repository.js';
import type {
  Carrito,
  CarritoFusionado,
  CuponCarrito,
  FilaEncabezadoCarrito,
  FilaFusion,
  FilaLineaCarrito,
  ItemCarrito,
  LineaFusion,
  Propietario,
  ResultadoCarritoSp,
} from './carrito.types.js';

/*
 * Sin lógica de existencias ni de cupones: los SPs deciden y el servicio solo da forma a la
 * respuesta. El carrito no se cachea (cambia con cada clic y trae existencia disponible).
 */

/** Elige el dueño del carrito: si hay usuario manda él (el token de invitado se ignora). */
export function elegirPropietario(
  idUsuario: number | undefined,
  tokenInvitado: string | undefined,
): Propietario {
  if (idUsuario !== undefined) return { idUsuario };
  return { tokenInvitado: tokenInvitado ?? null };
}

function aCupon(fila: FilaEncabezadoCarrito): CuponCarrito | null {
  if (fila.IDCupon === null) return null;
  const codigoError =
    fila.CodigoErrorCupon === null
      ? null
      : (CODIGO_POR_THROW.get(fila.CodigoErrorCupon) ?? 'CUPON_NO_APLICA');
  return {
    idCupon: fila.IDCupon,
    codigo: fila.CodigoCupon ?? '',
    descripcion: fila.DescripcionCupon,
    tipoDescuento: fila.TipoDescuento ?? '',
    valor: aMonto(fila.ValorCupon ?? 0),
    idCategoria: fila.IDCategoriaCupon,
    categoria: fila.CategoriaCupon,
    aplicado: Boolean(fila.CuponAplicado),
    codigoError,
    mensajeError: fila.MensajeErrorCupon,
  };
}

function aItem(fila: FilaLineaCarrito): ItemCarrito {
  return {
    idCarritoDetalle: fila.IDCarritoDetalle,
    idVariante: fila.IDVariante,
    sku: fila.SKU,
    idProducto: fila.IDProducto,
    producto: fila.Producto,
    idCategoria: fila.IDCategoria,
    categoria: fila.Categoria,
    variante: fila.DescripcionVariante,
    imagen: fila.ImagenPrincipal,
    precioUnitario: aMonto(fila.PrecioUnitario),
    cantidad: fila.Cantidad,
    importe: aMonto(fila.Importe),
    descuentoLinea: aMonto(fila.DescuentoLinea),
    importeNeto: aMonto(fila.ImporteNeto),
    elegibleCupon: Boolean(fila.ElegibleCupon),
    existenciaDisponible: fila.ExistenciaDisponible,
    vendible: Boolean(fila.Vendible),
    excedeDisponible: Boolean(fila.ExcedeDisponible),
    requiereAjuste: Boolean(fila.RequiereAjuste),
    fechaAgregado: aIso(fila.FechaAgregado),
  };
}

function aLineaFusion(fila: FilaFusion): LineaFusion {
  return {
    idVariante: fila.IDVariante,
    sku: fila.SKU,
    cantidadInvitado: fila.CantidadInvitado,
    cantidadAnterior: fila.CantidadAnterior,
    cantidadFinal: fila.CantidadFinal,
    cantidadAgregada: fila.CantidadAgregada,
    recortada: Boolean(fila.Recortada),
  };
}

/**
 * Arma la respuesta única del carrito desde RS1 y RS2. `tokenInvitado` solo se incluye cuando
 * el carrito es de un invitado (sin usuario): un cliente nunca lo recibe.
 */
export function armarCarrito(resultado: ResultadoCarritoSp, esInvitado: boolean): Carrito {
  const { encabezado: e, lineas } = resultado;
  const carrito: Carrito = {
    idCarrito: e.IDCarrito,
    items: lineas.map(aItem),
    cupon: aCupon(e),
    cantidadLineas: e.CantidadLineas,
    cantidadUnidades: e.CantidadUnidades,
    subtotal: aMonto(e.Subtotal),
    descuento: aMonto(e.Descuento),
    total: aMonto(e.Total),
    porcentajeIVA: aMonto(e.PorcentajeIVA),
    montoIVA: aMonto(e.MontoIVA),
    lineasRequierenAjuste: e.LineasRequierenAjuste,
  };
  if (esInvitado && e.TokenInvitado !== null) carrito.tokenInvitado = e.TokenInvitado.toLowerCase();
  return carrito;
}

/** 50030 trae la cifra solo en el mensaje ("Solo hay N unidad(es)…"): se copia a `details`. */
export function conDisponible(error: unknown): unknown {
  if (!(error instanceof AppError) || error.code !== 'STOCK_INSUFICIENTE') return error;
  const disponible = /Solo hay (\d+)/.exec(error.message)?.[1];
  if (disponible === undefined || error.details) return error;
  return new AppError('STOCK_INSUFICIENTE', error.message, [
    { field: 'cantidad', message: `Disponible: ${disponible}` },
  ]);
}

async function conStock(accion: Promise<ResultadoCarritoSp>): Promise<ResultadoCarritoSp> {
  try {
    return await accion;
  } catch (error) {
    throw conDisponible(error);
  }
}

const esInvitado = (dueno: Propietario): boolean => dueno.idUsuario === undefined;

export const carritoService = {
  async obtener(dueno: Propietario): Promise<Carrito> {
    return armarCarrito(await carritoRepository.obtener(dueno), esInvitado(dueno));
  },

  async agregarItem(dueno: Propietario, idVariante: number, cantidad: number): Promise<Carrito> {
    const r = await conStock(carritoRepository.agregarItem(dueno, idVariante, cantidad));
    return armarCarrito(r, esInvitado(dueno));
  },

  async actualizarCantidad(
    dueno: Propietario,
    idVariante: number,
    cantidad: number,
  ): Promise<Carrito> {
    const r = await conStock(carritoRepository.actualizarCantidad(dueno, idVariante, cantidad));
    return armarCarrito(r, esInvitado(dueno));
  },

  async eliminarItem(dueno: Propietario, idVariante: number): Promise<Carrito> {
    return armarCarrito(await carritoRepository.eliminarItem(dueno, idVariante), esInvitado(dueno));
  },

  async vaciar(dueno: Propietario): Promise<Carrito> {
    return armarCarrito(await carritoRepository.vaciar(dueno), esInvitado(dueno));
  },

  async aplicarCupon(idUsuario: number, codigo: string): Promise<Carrito> {
    return armarCarrito(await carritoRepository.aplicarCupon(idUsuario, codigo), false);
  },

  async quitarCupon(idUsuario: number): Promise<Carrito> {
    return armarCarrito(await carritoRepository.quitarCupon(idUsuario), false);
  },

  /** `tokenInvitado` del body, o el header X-Cart-Token si el body no lo trae. */
  async fusionar(
    idUsuario: number,
    tokenBody: string | undefined,
    tokenHeader: string | undefined,
  ): Promise<CarritoFusionado> {
    const token = (tokenBody ?? tokenHeader)?.toLowerCase();
    if (token === undefined) {
      throw new AppError('VALIDACION', 'La solicitud tiene datos inválidos.', [
        {
          field: 'tokenInvitado',
          message: 'Envía tokenInvitado en el body o el header X-Cart-Token.',
        },
      ]);
    }
    const r = await carritoRepository.fusionarInvitado(idUsuario, token);
    return { ...armarCarrito(r, false), fusion: (r.fusion ?? []).map(aLineaFusion) };
  },
};
