/** Forma del carrito (ver Backend/API.md, "Carrito"). El frontend nunca recalcula los montos. */

export interface LineaCarrito {
  idCarritoDetalle: number;
  idVariante: number;
  sku: string;
  idProducto: number;
  producto: string;
  idCategoria: number;
  categoria: string;
  variante: string | null;
  imagen: string | null;
  precioUnitario: string;
  cantidad: number;
  importe: string;
  descuentoLinea: string;
  importeNeto: string;
  elegibleCupon: boolean;
  existenciaDisponible: number;
  vendible: boolean;
  excedeDisponible: boolean;
  requiereAjuste: boolean;
  fechaAgregado: string;
}

export interface CuponCarrito {
  idCupon: number;
  codigo: string;
  descripcion: string | null;
  tipoDescuento: string;
  valor: string;
  idCategoria: number | null;
  categoria: string | null;
  aplicado: boolean;
  codigoError: string | null;
  mensajeError: string | null;
}

export interface LineaFusion {
  idVariante: number;
  sku: string;
  cantidadInvitado: number;
  cantidadAnterior: number;
  cantidadFinal: number;
  cantidadAgregada: number;
  recortada: boolean;
}

export interface Carrito {
  idCarrito: number | null;
  /** Solo a invitados con carrito. */
  tokenInvitado?: string;
  items: LineaCarrito[];
  cupon: CuponCarrito | null;
  cantidadLineas: number;
  cantidadUnidades: number;
  subtotal: string;
  descuento: string;
  total: string;
  porcentajeIVA: string;
  montoIVA: string;
  lineasRequierenAjuste: number;
  /** Solo en POST /carrito/fusionar. */
  fusion?: LineaFusion[];
}
