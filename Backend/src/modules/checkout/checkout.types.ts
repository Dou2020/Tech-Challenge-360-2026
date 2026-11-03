/** Encabezado del resumen (RS1 de SP_Inventario_ReservarExistencia y SP_Checkout_ObtenerResumen). */
export interface FilaResumenCheckout {
  IDCarrito: number;
  IDCupon: number | null;
  CodigoCupon: string | null;
  DescripcionCupon: string | null;
  TipoDescuento: string | null;
  ValorCupon: number | null;
  CuponAplicado: boolean;
  CodigoErrorCupon: number | null;
  MensajeErrorCupon: string | null;
  CantidadLineas: number;
  CantidadUnidades: number;
  Subtotal: number;
  Descuento: number;
  CostoEnvio: number;
  Total: number;
  PorcentajeIVA: number;
  MontoIVA: number;
  IDMetodoEnvio: number | null;
  MetodoEnvio: string | null;
  DiasEstimados: number | null;
  ReservaVigente: boolean;
  ReservaExpiraEn: Date | null;
}

/** Líneas del resumen (RS2). */
export interface FilaLineaCheckout {
  IDCarritoDetalle: number;
  IDVariante: number;
  SKU: string;
  Producto: string;
  DescripcionVariante: string | null;
  Cantidad: number;
  PrecioUnitario: number;
  Importe: number;
  DescuentoLinea: number;
  ImporteNeto: number;
}

export interface ResultadoResumenSp {
  encabezado: FilaResumenCheckout;
  lineas: FilaLineaCheckout[];
}

export interface FilaLiberacionReserva {
  ReservasLiberadas: number;
  UnidadesLiberadas: number;
}

export interface FilaPedidoCreado {
  IDPedido: number;
  NumeroPedido: string;
  Estado: string;
  Total: number;
  Repetido: boolean;
  /** Tarjeta usada o guardada; null si no hubo ninguna y en una repetición. */
  IDTarjetaGuardada: number | null;
}

export interface DatosPago {
  idDireccion: number;
  idMetodoEnvio: number;
  metodoPago: 'TARJETA';
  /** Pago con una tarjeta guardada: titular y últimos 4 salen de ella. */
  idTarjeta: number | null;
  titular: string | null;
  ultimos4: string | null;
  tipo: string | null;
  marca: string | null;
  guardar: boolean;
}

// --- Respuestas de la API ---

export interface LineaResumen {
  idCarritoDetalle: number;
  idVariante: number;
  sku: string;
  producto: string;
  variante: string | null;
  cantidad: number;
  precioUnitario: string;
  importe: string;
  descuentoLinea: string;
  /** Importe de la línea menos su descuento. */
  subtotal: string;
}

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

export interface ResumenCheckout {
  idCarrito: number;
  items: LineaResumen[];
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
  reservaExpiraEn: string | null;
}

export interface LiberacionReserva {
  reservasLiberadas: number;
  unidadesLiberadas: number;
}

export interface PedidoCreado {
  idPedido: number;
  numeroPedido: string;
  estado: string;
  total: string;
  /** Tarjeta usada o recién guardada; null si no se usó ni guardó ninguna o si fue una repetición. */
  idTarjetaGuardada: number | null;
}
