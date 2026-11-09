/** Fila de SP_Pedidos_Listar (RS1). */
export interface FilaPedidoListado {
  IDPedido: number;
  NumeroPedido: string;
  IDUsuario: number;
  Cliente: string;
  CorreoCliente: string;
  Estado: string;
  NombreEstado: string;
  Subtotal: number;
  Descuento: number;
  CostoEnvio: number;
  Total: number;
  CantidadLineas: number;
  CantidadUnidades: number;
  FechaCreacion: Date;
}

/** RS1 de SP_Pedidos_ObtenerPorId, CambiarEstado y Cancelar. */
export interface FilaPedido {
  IDPedido: number;
  NumeroPedido: string;
  IDUsuario: number;
  Cliente: string;
  CorreoCliente: string;
  Estado: string;
  NombreEstado: string;
  EsFinal: boolean;
  /** NULL en un retiro en sucursal. */
  IDDireccion: number | null;
  DireccionEntrega: string;
  /** Solo en el detalle (SP_Pedidos_ObtenerPorId). IDSucursal y Sucursal son NULL con envío a domicilio. */
  IDSucursal?: number | null;
  Sucursal?: string | null;
  RetiroEnSucursal?: boolean;
  IDMetodoEnvio: number;
  MetodoEnvio: string;
  DiasEstimados: number;
  IDCupon: number | null;
  CodigoCupon: string | null;
  Subtotal: number;
  Descuento: number;
  CostoEnvio: number;
  MontoIVA: number;
  Total: number;
  MontoReembolsado: number;
  IDPago: number;
  MetodoPago: string;
  MontoPago: number;
  EstadoPago: string;
  ReferenciaTransaccion: string;
  FechaPago: Date;
  FechaCreacion: Date;
}

/** RS2: líneas con precios congelados. */
export interface FilaLineaPedido {
  IDPedidoDetalle: number;
  IDVariante: number;
  SKU: string;
  NombreProducto: string;
  DescripcionVariante: string | null;
  Cantidad: number;
  PrecioUnitario: number;
  DescuentoLinea: number;
  Subtotal: number;
  CantidadDevuelta: number;
  CantidadDevolvible: number;
}

/** RS3: transiciones posibles para el rol del solicitante. */
export interface FilaTransicionPosible {
  CodigoEstado: string;
  NombreEstado: string;
  Via: 'ESTADO' | 'CANCELAR' | 'DEVOLUCION';
}

export interface ResultadoDetallePedidoSp {
  pedido: FilaPedido;
  lineas: FilaLineaPedido[];
  transiciones: FilaTransicionPosible[];
}

export interface FilaEstadoPedido {
  IDEstadoPedido: number;
  Codigo: string;
  Nombre: string;
  EsFinal: boolean;
}

export interface FilaTransicionCatalogo {
  CodigoOrigen: string;
  CodigoDestino: string;
  Rol: string;
  PermitidaParaSolicitante: boolean;
  Via: 'ESTADO' | 'CANCELAR' | 'DEVOLUCION';
}

export interface FilaHistorialEstado {
  IDHistorialEstadoPedido: number;
  IDPedido: number;
  CodigoEstadoAnterior: string | null;
  EstadoAnterior: string | null;
  CodigoEstadoNuevo: string;
  EstadoNuevo: string;
  IDUsuario: number;
  Usuario: string;
  Comentario: string | null;
  Fecha: Date;
}

export interface FilaDevolucion {
  IDDevolucion: number;
  IDPedido: number;
  Tipo: string;
  Motivo: string;
  MontoReembolso: number;
  IDUsuario: number;
  Usuario: string;
  Fecha: Date;
}

export interface FilaDevolucionDetalle {
  IDDevolucion: number;
  IDDevolucionDetalle: number;
  IDPedidoDetalle: number;
  SKU: string;
  NombreProducto: string;
  DescripcionVariante: string | null;
  Cantidad: number;
  MontoReembolso: number;
}

export interface FilaDevolucionRegistrada {
  IDDevolucion: number;
  IDPedido: number;
  Tipo: string;
  MontoReembolso: number;
  Motivo: string;
  EstadoPedido: string;
  Fecha: Date;
}

export interface FiltrosPedidosSp {
  estado: string | null;
  idCliente: number | null;
  desde: Date | null;
  hasta: Date | null;
  q: string | null;
}

export interface LineaDevolucion {
  idPedidoDetalle: number;
  cantidad: number;
}

// --- Respuestas de la API ---

export interface PedidoResumen {
  idPedido: number;
  numeroPedido: string;
  idUsuario: number;
  cliente: string;
  correoCliente: string;
  estado: string;
  nombreEstado: string;
  subtotal: string;
  descuento: string;
  costoEnvio: string;
  total: string;
  cantidadLineas: number;
  cantidadUnidades: number;
  fechaCreacion: string;
}

export interface LineaPedido {
  idPedidoDetalle: number;
  idVariante: number;
  sku: string;
  nombreProducto: string;
  variante: string | null;
  cantidad: number;
  precioUnitario: string;
  descuentoLinea: string;
  subtotal: string;
  cantidadDevuelta: number;
  cantidadDevolvible: number;
}

export interface TransicionPosible {
  estado: string;
  nombre: string;
  via: 'ESTADO' | 'CANCELAR' | 'DEVOLUCION';
}

export interface PedidoDetalle {
  idPedido: number;
  numeroPedido: string;
  idUsuario: number;
  cliente: string;
  correoCliente: string;
  estado: string;
  nombreEstado: string;
  esFinal: boolean;
  /** En un retiro en sucursal `idDireccion` es null y `entrega` describe la sucursal. */
  direccion: { idDireccion: number | null; entrega: string };
  retiroEnSucursal: boolean;
  sucursal: { idSucursal: number; nombre: string } | null;
  metodoEnvio: { idMetodoEnvio: number; nombre: string; diasEstimados: number };
  cupon: { idCupon: number; codigo: string } | null;
  subtotal: string;
  descuento: string;
  costoEnvio: string;
  montoIVA: string;
  total: string;
  montoReembolsado: string;
  pago: {
    idPago: number;
    metodoPago: string;
    monto: string;
    estado: string;
    referencia: string;
    fecha: string;
  };
  fechaCreacion: string;
  lineas: LineaPedido[];
  transiciones: TransicionPosible[];
}

export interface EstadosPedido {
  estados: { codigo: string; nombre: string; esFinal: boolean }[];
  transiciones: {
    origen: string;
    destino: string;
    rol: string;
    permitida: boolean;
    via: string;
  }[];
}

export interface CambioEstado {
  idHistorialEstadoPedido: number;
  idPedido: number;
  estadoAnterior: { codigo: string; nombre: string } | null;
  estadoNuevo: { codigo: string; nombre: string };
  idUsuario: number;
  usuario: string;
  comentario: string | null;
  fecha: string;
}

export interface Devolucion {
  idDevolucion: number;
  idPedido: number;
  tipo: string;
  motivo: string;
  montoReembolso: string;
  idUsuario: number;
  usuario: string;
  fecha: string;
  lineas: {
    idDevolucionDetalle: number;
    idPedidoDetalle: number;
    sku: string;
    nombreProducto: string;
    variante: string | null;
    cantidad: number;
    montoReembolso: string;
  }[];
}

export interface DevolucionRegistrada {
  idDevolucion: number;
  idPedido: number;
  tipo: string;
  montoReembolso: string;
  motivo: string;
  estadoPedido: string;
  fecha: string;
}
