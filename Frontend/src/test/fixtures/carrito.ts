import type { Carrito, LineaCarrito } from '../../types/carrito';

export function crearLineaCarrito(parcial: Partial<LineaCarrito> = {}): LineaCarrito {
  return {
    idCarritoDetalle: 1,
    idVariante: 41,
    sku: 'CAM-BAS-M-AZ',
    idProducto: 9,
    producto: 'Camisa básica',
    idCategoria: 2,
    categoria: 'Camisetas',
    variante: 'Talla M / Azul',
    imagen: null,
    precioUnitario: '149.00',
    cantidad: 2,
    importe: '298.00',
    descuentoLinea: '0.00',
    importeNeto: '298.00',
    elegibleCupon: true,
    existenciaDisponible: 7,
    vendible: true,
    excedeDisponible: false,
    requiereAjuste: false,
    fechaAgregado: '2026-11-01T15:30:00.000Z',
    ...parcial,
  };
}

export function crearCarrito(parcial: Partial<Carrito> = {}): Carrito {
  return {
    idCarrito: 88,
    items: [crearLineaCarrito()],
    cupon: null,
    cantidadLineas: 1,
    cantidadUnidades: 2,
    subtotal: '298.00',
    descuento: '0.00',
    total: '298.00',
    porcentajeIVA: '12.00',
    montoIVA: '31.93',
    lineasRequierenAjuste: 0,
    ...parcial,
  };
}

/** Carrito vacío tal como lo devuelve la API. */
export function crearCarritoVacio(parcial: Partial<Carrito> = {}): Carrito {
  return crearCarrito({
    idCarrito: null,
    items: [],
    cantidadLineas: 0,
    cantidadUnidades: 0,
    subtotal: '0.00',
    total: '0.00',
    montoIVA: '0.00',
    ...parcial,
  });
}
