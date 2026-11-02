import { cache } from '../../shared/cache/cache.js';
import { AppError, type DetalleError } from '../../shared/errors/AppError.js';
import { CODIGO_POR_THROW } from '../../shared/errors/codigos.js';
import { aIsoOpcional } from '../../shared/utils/fechas.js';
import { aMonto } from '../../shared/utils/montos.js';
import { checkoutRepository } from './checkout.repository.js';
import type {
  CuponResumen,
  DatosPago,
  FilaLineaCheckout,
  LiberacionReserva,
  PedidoCreado,
  ResultadoResumenSp,
  ResumenCheckout,
} from './checkout.types.js';

/*
 * Reglas de existencia, cupón, idempotencia y pago viven en los SPs (transacción y bloqueos).
 * El checkout nunca se cachea: trae reservas y existencias. Tras crear un pedido nuevo se
 * invalida la caché de reportes (después de que el SP confirmó).
 */

const SEPARADOR_DETALLE = '\nDETALLE=';

interface VarianteFaltante {
  idVariante: number;
  sku: string;
  solicitado: number;
  disponible: number;
}

function aDetalles(texto: string): DetalleError[] | undefined {
  try {
    const parseado: unknown = JSON.parse(texto);
    if (!Array.isArray(parseado)) return undefined;
    return (parseado as VarianteFaltante[]).map((v) => ({
      field: `idVariante:${v.idVariante}`,
      message: `${v.sku}: solicitado ${v.solicitado}, disponible ${v.disponible}.`,
    }));
  } catch {
    return undefined;
  }
}

/**
 * El 50030 de reservar trae `<texto>\nDETALLE=<json>`: el texto va a `message` y el JSON a
 * `details`, con un elemento por variante. Si el JSON no se puede leer, solo queda el texto.
 */
export function separarDetalleStock(error: unknown): unknown {
  if (!(error instanceof AppError) || error.code !== 'STOCK_INSUFICIENTE') return error;
  const indice = error.message.indexOf(SEPARADOR_DETALLE);
  if (indice < 0) return error;
  const texto = error.message.slice(0, indice);
  const detalles = aDetalles(error.message.slice(indice + SEPARADOR_DETALLE.length));
  return new AppError('STOCK_INSUFICIENTE', texto, detalles);
}

function aLinea(fila: FilaLineaCheckout) {
  return {
    idCarritoDetalle: fila.IDCarritoDetalle,
    idVariante: fila.IDVariante,
    sku: fila.SKU,
    producto: fila.Producto,
    variante: fila.DescripcionVariante,
    cantidad: fila.Cantidad,
    precioUnitario: aMonto(fila.PrecioUnitario),
    importe: aMonto(fila.Importe),
    descuentoLinea: aMonto(fila.DescuentoLinea),
    subtotal: aMonto(fila.ImporteNeto),
  };
}

/** Da forma a los dos result sets del resumen. */
export function armarResumen({ encabezado: e, lineas }: ResultadoResumenSp): ResumenCheckout {
  let cupon: CuponResumen | null = null;
  if (e.IDCupon !== null) {
    cupon = {
      idCupon: e.IDCupon,
      codigo: e.CodigoCupon ?? '',
      descripcion: e.DescripcionCupon,
      tipoDescuento: e.TipoDescuento ?? '',
      valor: aMonto(e.ValorCupon ?? 0),
      aplicado: Boolean(e.CuponAplicado),
      codigoError:
        e.CodigoErrorCupon === null
          ? null
          : (CODIGO_POR_THROW.get(e.CodigoErrorCupon) ?? 'CUPON_NO_APLICA'),
      mensajeError: e.MensajeErrorCupon,
    };
  }
  return {
    idCarrito: e.IDCarrito,
    items: lineas.map(aLinea),
    cupon,
    cantidadLineas: e.CantidadLineas,
    cantidadUnidades: e.CantidadUnidades,
    subtotal: aMonto(e.Subtotal),
    descuento: aMonto(e.Descuento),
    costoEnvio: aMonto(e.CostoEnvio),
    total: aMonto(e.Total),
    porcentajeIVA: aMonto(e.PorcentajeIVA),
    montoIVA: aMonto(e.MontoIVA),
    metodoEnvio:
      e.IDMetodoEnvio === null
        ? null
        : {
            idMetodoEnvio: e.IDMetodoEnvio,
            nombre: e.MetodoEnvio ?? '',
            diasEstimados: e.DiasEstimados,
          },
    reservaVigente: Boolean(e.ReservaVigente),
    reservaExpiraEn: aIsoOpcional(e.ReservaExpiraEn),
  };
}

export const checkoutService = {
  async iniciar(
    idUsuario: number,
    idDireccion: number,
    idMetodoEnvio: number,
  ): Promise<ResumenCheckout> {
    try {
      return armarResumen(await checkoutRepository.reservar(idUsuario, idDireccion, idMetodoEnvio));
    } catch (error) {
      throw separarDetalleStock(error);
    }
  },

  async obtenerResumen(idUsuario: number, idMetodoEnvio?: number): Promise<ResumenCheckout> {
    return armarResumen(await checkoutRepository.obtenerResumen(idUsuario, idMetodoEnvio ?? null));
  },

  async liberarReserva(idUsuario: number): Promise<LiberacionReserva> {
    const fila = await checkoutRepository.liberarReserva(idUsuario);
    return { reservasLiberadas: fila.ReservasLiberadas, unidadesLiberadas: fila.UnidadesLiberadas };
  },

  /** `creado` es true cuando se insertó el pedido (201) y false en una repetición (200). */
  async pagar(
    idUsuario: number,
    claveIdempotencia: string,
    datos: DatosPago,
  ): Promise<{ pedido: PedidoCreado; creado: boolean }> {
    const fila = await checkoutRepository.crearPedido(idUsuario, claveIdempotencia, datos);
    const creado = !fila.Repetido;
    // Solo un pedido nuevo cambia los reportes; se invalida después de que el SP confirmó.
    if (creado) await cache.invalidar('reportes');
    return {
      creado,
      pedido: {
        idPedido: fila.IDPedido,
        numeroPedido: fila.NumeroPedido,
        estado: fila.Estado,
        total: aMonto(fila.Total),
      },
    };
  },
};
