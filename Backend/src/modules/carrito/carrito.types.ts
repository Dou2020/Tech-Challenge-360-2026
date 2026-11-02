/**
 * Filas de los SPs del carrito y DTO de la API.
 * Contrato de los SPs: Database/scripts/010_sp_carrito.sql (SP_Carrito_*).
 */

/** Quién es el dueño del carrito: el usuario del token manda sobre el token de invitado. */
export type Propietario =
  | { idUsuario: number; tokenInvitado?: undefined }
  | { idUsuario?: undefined; tokenInvitado: string | null };

/** RS1: encabezado (siempre una fila; sin carrito, IDCarrito es NULL y los montos 0). */
export interface FilaEncabezadoCarrito {
  IDCarrito: number | null;
  TokenInvitado: string | null;
  IDUsuario: number | null;
  IDCupon: number | null;
  CodigoCupon: string | null;
  DescripcionCupon: string | null;
  TipoDescuento: string | null;
  ValorCupon: number | null;
  IDCategoriaCupon: number | null;
  CategoriaCupon: string | null;
  CuponAplicado: boolean;
  CodigoErrorCupon: number | null;
  MensajeErrorCupon: string | null;
  CantidadLineas: number;
  CantidadUnidades: number;
  Subtotal: number;
  Descuento: number;
  Total: number;
  PorcentajeIVA: number;
  MontoIVA: number;
  LineasRequierenAjuste: number;
  FechaCreacion: Date | null;
  FechaUltimaActividad: Date | null;
}

/** RS2: una fila por línea. */
export interface FilaLineaCarrito {
  IDCarritoDetalle: number;
  IDVariante: number;
  SKU: string;
  IDProducto: number;
  Producto: string;
  IDCategoria: number;
  Categoria: string;
  DescripcionVariante: string | null;
  ImagenPrincipal: string | null;
  PrecioUnitario: number;
  Cantidad: number;
  Importe: number;
  DescuentoLinea: number;
  ImporteNeto: number;
  ElegibleCupon: boolean;
  ExistenciaDisponible: number;
  Vendible: boolean;
  ExcedeDisponible: boolean;
  RequiereAjuste: boolean;
  FechaAgregado: Date;
}

/** RS3 de SP_Carrito_FusionarInvitado: una fila por variante del carrito de invitado. */
export interface FilaFusion {
  IDVariante: number;
  SKU: string;
  CantidadInvitado: number;
  CantidadAnterior: number;
  CantidadFinal: number;
  CantidadAgregada: number;
  Recortada: boolean;
}

export interface ResultadoCarritoSp {
  encabezado: FilaEncabezadoCarrito;
  lineas: FilaLineaCarrito[];
  /** Solo en la fusión. */
  fusion?: FilaFusion[];
}

export interface CuponCarrito {
  idCupon: number;
  codigo: string;
  descripcion: string | null;
  tipoDescuento: string;
  valor: string;
  idCategoria: number | null;
  categoria: string | null;
  /** false si el cupón guardado ya no vale (vencido, agotado…); sigue guardado hasta quitarlo. */
  aplicado: boolean;
  codigoError: string | null;
  mensajeError: string | null;
}

export interface ItemCarrito {
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

export interface Carrito {
  /** null si todavía no hay carrito (GET de un cliente o invitado sin carrito). */
  idCarrito: number | null;
  /** Solo se entrega a invitados. */
  tokenInvitado?: string;
  items: ItemCarrito[];
  cupon: CuponCarrito | null;
  cantidadLineas: number;
  cantidadUnidades: number;
  subtotal: string;
  descuento: string;
  total: string;
  porcentajeIVA: string;
  montoIVA: string;
  lineasRequierenAjuste: number;
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

export interface CarritoFusionado extends Carrito {
  fusion: LineaFusion[];
}
