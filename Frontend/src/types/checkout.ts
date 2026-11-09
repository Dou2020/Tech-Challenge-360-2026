import type { MarcaTarjeta, TipoTarjeta } from './tarjetas';

/** Línea del resumen de checkout (POST /checkout/iniciar y GET /checkout). */
export interface LineaCheckout {
  idCarritoDetalle: number;
  idVariante: number;
  sku: string;
  producto: string;
  variante: string | null;
  cantidad: number;
  precioUnitario: string;
  importe: string;
  descuentoLinea: string;
  subtotal: string;
}

/** Cupón del resumen de checkout (sin categoría, a diferencia del carrito). */
export interface CuponResumen {
  idCupon: number;
  codigo: string;
  descripcion: string | null;
  tipoDescuento: string;
  valor: string;
  aplicado: boolean;
  codigoError: string | null;
  mensajeError: string | null;
}

/** Entrega elegida: dirección (domicilio) o sucursal (retiro), según el método de envío. */
export interface EntregaCheckout {
  idMetodoEnvio: number;
  idDireccion?: number;
  idSucursal?: number;
}

/** Resumen con los montos finales calculados por el backend, más la reserva vigente. */
export interface ResumenCheckout {
  idCarrito: number;
  items: LineaCheckout[];
  cupon: CuponResumen | null;
  cantidadLineas: number;
  cantidadUnidades: number;
  subtotal: string;
  descuento: string;
  costoEnvio: string;
  total: string;
  porcentajeIVA: string;
  montoIVA: string;
  metodoEnvio: { idMetodoEnvio: number; nombre: string; diasEstimados: number | null } | null;
  reservaVigente: boolean;
  /** ISO 8601 UTC: hasta cuándo está reservada la existencia. */
  reservaExpiraEn: string | null;
}

/** Tarjeta guardada: el backend rechaza cualquier otro campo. */
export interface DatosPagoGuardada {
  idTarjeta: number;
}

/** Tarjeta nueva. Con `guardar: true`, `tipo` y `marca` son obligatorios. */
export interface DatosPagoNueva {
  titular: string;
  ultimos4: string;
  tipo?: TipoTarjeta;
  marca?: MarcaTarjeta;
  guardar?: boolean;
}

export type DatosPago = DatosPagoGuardada | DatosPagoNueva;

/** Body de POST /checkout/pagar. */
export interface SolicitudPago {
  /** Envío a domicilio. */
  idDireccion?: number;
  /** Retiro en sucursal. */
  idSucursal?: number;
  idMetodoEnvio: number;
  metodoPago: 'TARJETA';
  datosPago: DatosPago;
}

/** Respuesta de POST /checkout/pagar (201 pedido nuevo, 200 repetición). */
export interface PedidoCreado {
  idPedido: number;
  numeroPedido: string;
  estado: string;
  total: string;
  /** Tarjeta usada o recién guardada; null si no se usó ni guardó ninguna. */
  idTarjetaGuardada: number | null;
}
