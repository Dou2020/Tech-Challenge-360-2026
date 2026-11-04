import type { PedidoDetalle, PedidoResumen } from '../../types/pedidos';

export function crearPedidoResumen(parcial: Partial<PedidoResumen> = {}): PedidoResumen {
  return {
    idPedido: 1503,
    numeroPedido: 'SC-2026-001503',
    idUsuario: 6,
    cliente: 'Ana López',
    correoCliente: 'cliente@shopcart.gt',
    estado: 'PAGADO',
    nombreEstado: 'Pagado',
    subtotal: '298.00',
    descuento: '0.00',
    costoEnvio: '25.00',
    total: '323.00',
    cantidadLineas: 1,
    cantidadUnidades: 2,
    fechaCreacion: '2026-11-03T15:30:00.000Z',
    ...parcial,
  };
}

/** Detalle con un total que NO es la suma de sus líneas, para detectar recálculos. */
export function crearPedidoDetalle(parcial: Partial<PedidoDetalle> = {}): PedidoDetalle {
  return {
    idPedido: 1503,
    numeroPedido: 'SC-2026-001503',
    idUsuario: 6,
    cliente: 'Ana López',
    correoCliente: 'cliente@shopcart.gt',
    estado: 'PAGADO',
    nombreEstado: 'Pagado',
    esFinal: false,
    direccion: { idDireccion: 5, entrega: 'Casa, 5a avenida 10-20, Mixco, Guatemala' },
    metodoEnvio: { idMetodoEnvio: 1, nombre: 'Estándar', diasEstimados: 3 },
    cupon: null,
    subtotal: '298.00',
    descuento: '0.00',
    costoEnvio: '25.00',
    montoIVA: '34.61',
    total: '323.00',
    montoReembolsado: '0.00',
    pago: {
      idPago: 9,
      metodoPago: 'TARJETA',
      monto: '323.00',
      estado: 'APROBADO',
      referencia: 'SIM-1',
      fecha: '2026-11-03T15:31:00.000Z',
    },
    fechaCreacion: '2026-11-03T15:31:00.000Z',
    lineas: [
      {
        idPedidoDetalle: 3021,
        idVariante: 41,
        sku: 'CAM-LIM-NEG-M',
        nombreProducto: 'Camiseta',
        variante: 'M / Negro',
        cantidad: 2,
        precioUnitario: '149.00',
        descuentoLinea: '0.00',
        subtotal: '298.00',
        cantidadDevuelta: 0,
        cantidadDevolvible: 0,
      },
    ],
    transiciones: [],
    ...parcial,
  };
}
