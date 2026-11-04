/** Pedidos (ver Backend/API.md, "Pedidos"). Montos como string decimal; fechas ISO 8601 UTC. */

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

/** Qué puede hacer ahora quien consulta; `via` indica el endpoint que lo ejecuta. */
export interface TransicionPedido {
  estado: string;
  nombre: string;
  via: 'ESTADO' | 'CANCELAR' | 'DEVOLUCION';
}

export interface PagoPedido {
  idPago: number;
  metodoPago: string;
  monto: string;
  estado: string;
  referencia: string;
  fecha: string;
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
  direccion: { idDireccion: number; entrega: string };
  metodoEnvio: { idMetodoEnvio: number; nombre: string; diasEstimados: number };
  cupon: { idCupon: number; codigo: string } | null;
  subtotal: string;
  descuento: string;
  costoEnvio: string;
  montoIVA: string;
  total: string;
  montoReembolsado: string;
  pago: PagoPedido;
  fechaCreacion: string;
  lineas: LineaPedido[];
  transiciones: TransicionPedido[];
}

export interface EstadoRef {
  codigo: string;
  nombre: string;
}

export interface CambioEstadoPedido {
  idHistorialEstadoPedido: number;
  idPedido: number;
  estadoAnterior: EstadoRef | null;
  estadoNuevo: EstadoRef;
  idUsuario: number;
  usuario: string;
  comentario: string | null;
  fecha: string;
}

export interface LineaDevolucion {
  idPedidoDetalle: number;
  sku: string;
  nombreProducto: string;
  cantidad: number;
  montoReembolso: string;
}

export interface DevolucionPedido {
  idDevolucion: number;
  tipo: string;
  motivo: string;
  montoReembolso: string;
  usuario: string;
  fecha: string;
  lineas: LineaDevolucion[];
}

export interface EstadosPedido {
  estados: { codigo: string; nombre: string; esFinal: boolean }[];
  transiciones: {
    origen: string;
    destino: string;
    rol: string;
    permitida: boolean;
    via: 'ESTADO' | 'CANCELAR' | 'DEVOLUCION';
  }[];
}

export interface DatosDevolucion {
  motivo: string;
  lineas: { idPedidoDetalle: number; cantidad: number }[];
}

export interface DevolucionRegistrada {
  idDevolucion: number;
  tipo: string;
  montoReembolso: string;
  estadoPedido: string;
}
