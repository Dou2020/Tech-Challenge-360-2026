/**
 * Filas de los SPs del catálogo (PascalCase, como las devuelve SQL Server) y DTOs de la API
 * (camelCase, montos como string de 2 decimales y fechas ISO 8601 UTC).
 * Contrato de los SPs: Database/scripts/008_sp_catalogo.sql.
 */

// ---------------------------------------------------------------------------
// Filas de los SPs
// ---------------------------------------------------------------------------

/** SP_Catalogo_ListarCategorias. */
export interface FilaCategoriaPublica {
  IDCategoria: number;
  Nombre: string;
  Descripcion: string | null;
  CantidadProductos: number;
}

/** SP_Catalogo_BuscarProductos. */
export interface FilaProductoCatalogo {
  IDProducto: number;
  Nombre: string;
  Descripcion: string | null;
  IDCategoria: number;
  Categoria: string;
  PrecioMinimo: number;
  PrecioMaximo: number;
  Disponible: boolean;
  ImagenPrincipal: string | null;
  FechaCreacion: Date;
}

/** RS1 de SP_Catalogo_ObtenerProducto. */
export interface FilaProductoPublico {
  IDProducto: number;
  Nombre: string;
  Descripcion: string | null;
  IDCategoria: number;
  Categoria: string;
  PrecioMinimo: number;
  PrecioMaximo: number;
  Disponible: boolean;
  FechaCreacion: Date;
}

/** RS2 de SP_Catalogo_ObtenerProducto: solo variantes activas. */
export interface FilaVariantePublica {
  IDVariante: number;
  SKU: string;
  Precio: number;
  ExistenciaDisponible: number;
  Descripcion: string | null;
}

/** Forma VAL: valor de atributo de una variante. */
export interface FilaValorVariante {
  IDVariante: number;
  IDAtributo: number;
  Atributo: string;
  IDValorAtributo: number;
  Valor: string;
}

/** Imágenes del producto: la principal primero, luego por Orden. */
export interface FilaImagen {
  IDProductoImagen: number;
  Url: string;
  Orden: number;
  EsPrincipal: boolean;
}

/** SP_Checkout_ListarMetodosEnvio. */
export interface FilaMetodoEnvio {
  IDMetodoEnvio: number;
  Nombre: string;
  Costo: number;
  DiasEstimados: number;
  RequiereSucursal: boolean;
}

/** Forma CAT: SP_Categorias_*. */
export interface FilaCategoria {
  IDCategoria: number;
  Nombre: string;
  Descripcion: string | null;
  Activo: boolean;
  CantidadProductos: number;
  CantidadCupones: number;
}

/** SP_Productos_Listar. */
export interface FilaProductoListado {
  IDProducto: number;
  Nombre: string;
  IDCategoria: number;
  Categoria: string;
  Activo: boolean;
  CantidadVariantes: number;
  CantidadVariantesActivas: number;
  PrecioMinimo: number | null;
  PrecioMaximo: number | null;
  ExistenciaFisica: number;
  ExistenciaReservada: number;
  ExistenciaDisponible: number;
  ImagenPrincipal: string | null;
  FechaCreacion: Date;
  FechaModificacion: Date | null;
}

/** RS1 de PROD_DETALLE (SP_Productos_ObtenerPorId, Crear, Actualizar, CambiarEstado, AgregarImagen). */
export interface FilaProducto {
  IDProducto: number;
  Nombre: string;
  Descripcion: string | null;
  IDCategoria: number;
  Categoria: string;
  CategoriaActiva: boolean;
  Activo: boolean;
  FechaCreacion: Date;
  FechaModificacion: Date | null;
  TieneVentas: boolean;
  PuedeEliminarse: boolean;
}

/** Forma VAR (todas las variantes, para gestión). */
export interface FilaVariante {
  IDVariante: number;
  IDProducto: number;
  SKU: string;
  Precio: number;
  ExistenciaFisica: number;
  ExistenciaReservada: number;
  ExistenciaDisponible: number;
  Activo: boolean;
  Descripcion: string | null;
}

/** Los 4 result sets de PROD_DETALLE. */
export interface ResultSetsProducto {
  producto: FilaProducto | undefined;
  variantes: FilaVariante[];
  valores: FilaValorVariante[];
  imagenes: FilaImagen[];
}

/** Los 4 result sets de SP_Catalogo_ObtenerProducto. */
export interface ResultSetsProductoPublico {
  producto: FilaProductoPublico | undefined;
  variantes: FilaVariantePublica[];
  valores: FilaValorVariante[];
  imagenes: FilaImagen[];
}

/** Los 2 result sets de VAR_DETALLE (SP_Variantes_*). */
export interface ResultSetsVariante {
  variante: FilaVariante | undefined;
  valores: FilaValorVariante[];
}

/** RS1 de SP_Atributos_Listar y fila de SP_Atributos_Crear (sin CantidadValores). */
export interface FilaAtributo {
  IDAtributo: number;
  Nombre: string;
  CantidadValores?: number;
}

/** RS2 de SP_Atributos_Listar. */
export interface FilaValorAtributo {
  IDValorAtributo: number;
  IDAtributo: number;
  Valor: string;
  CantidadVariantes: number;
}

/** Fila de SP_Atributos_AgregarValor. */
export interface FilaValorCreado {
  IDValorAtributo: number;
  IDAtributo: number;
  Atributo: string;
  Valor: string;
}

// ---------------------------------------------------------------------------
// Datos de entrada ya validados (los arma el esquema zod)
// ---------------------------------------------------------------------------

export interface FiltrosCatalogo {
  q?: string | undefined;
  idCategoria?: number | undefined;
  precioMin?: number | undefined;
  precioMax?: number | undefined;
  disponible?: boolean | undefined;
}

export interface FiltrosCategorias {
  q?: string | undefined;
  activo?: boolean | undefined;
}

export interface FiltrosProductos {
  q?: string | undefined;
  idCategoria?: number | undefined;
  activo?: boolean | undefined;
}

export interface DatosCategoria {
  nombre: string;
  descripcion: string | null;
}

export interface DatosProducto {
  idCategoria: number;
  nombre: string;
  descripcion: string | null;
}

export interface DatosVarianteNueva {
  sku: string;
  /** Validado con esquemaMonto: number con hasta 2 decimales. */
  precio: number;
  existenciaInicial: number;
  /** IDValorAtributo; como máximo uno por atributo (lo valida el SP). */
  valores: number[];
}

export interface DatosProductoNuevo extends DatosProducto {
  variantes: DatosVarianteNueva[];
}

export interface DatosVarianteActualizada {
  sku: string;
  /** undefined conserva los valores actuales; [] los quita todos. */
  valores?: number[] | undefined;
}

export interface DatosImagen {
  url: string;
  orden: number;
  esPrincipal: boolean;
}

// ---------------------------------------------------------------------------
// DTOs de la API
// ---------------------------------------------------------------------------

export interface ValorVariante {
  idAtributo: number;
  atributo: string;
  idValorAtributo: number;
  valor: string;
}

export interface Imagen {
  idProductoImagen: number;
  url: string;
  orden: number;
  esPrincipal: boolean;
}

export interface CategoriaPublica {
  idCategoria: number;
  nombre: string;
  descripcion: string | null;
  /** Productos visibles en la tienda. */
  cantidadProductos: number;
}

export interface MetodoEnvio {
  idMetodoEnvio: number;
  nombre: string;
  costo: string;
  diasEstimados: number;
  requiereSucursal: boolean;
}

export interface ProductoCatalogo {
  idProducto: number;
  nombre: string;
  descripcion: string | null;
  idCategoria: number;
  categoria: string;
  precioMinimo: string;
  precioMaximo: string;
  /** Alguna variante activa tiene existencia disponible. */
  disponible: boolean;
  imagenPrincipal: string | null;
  fechaCreacion: string;
}

export interface VariantePublica {
  idVariante: number;
  sku: string;
  precio: string;
  existenciaDisponible: number;
  /** "Talla M / Color Negro". */
  descripcion: string | null;
  valores: ValorVariante[];
}

export interface ProductoPublico {
  idProducto: number;
  nombre: string;
  descripcion: string | null;
  idCategoria: number;
  categoria: string;
  precioMinimo: string;
  precioMaximo: string;
  disponible: boolean;
  fechaCreacion: string;
  imagenes: Imagen[];
  variantes: VariantePublica[];
}

export interface Categoria {
  idCategoria: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  cantidadProductos: number;
  cantidadCupones: number;
}

export interface ProductoListado {
  idProducto: number;
  nombre: string;
  idCategoria: number;
  categoria: string;
  activo: boolean;
  cantidadVariantes: number;
  cantidadVariantesActivas: number;
  precioMinimo: string | null;
  precioMaximo: string | null;
  existenciaFisica: number;
  existenciaReservada: number;
  existenciaDisponible: number;
  imagenPrincipal: string | null;
  fechaCreacion: string;
  fechaModificacion: string | null;
}

export interface Variante {
  idVariante: number;
  idProducto: number;
  sku: string;
  precio: string;
  existenciaFisica: number;
  /** Solo reservas vigentes. */
  existenciaReservada: number;
  existenciaDisponible: number;
  activo: boolean;
  descripcion: string | null;
  valores: ValorVariante[];
}

export interface Producto {
  idProducto: number;
  nombre: string;
  descripcion: string | null;
  idCategoria: number;
  categoria: string;
  categoriaActiva: boolean;
  activo: boolean;
  fechaCreacion: string;
  fechaModificacion: string | null;
  tieneVentas: boolean;
  /** Sin ventas, kardex ni reservas: DELETE respondería 204. */
  puedeEliminarse: boolean;
  variantes: Variante[];
  imagenes: Imagen[];
}

export interface ValorAtributo {
  idValorAtributo: number;
  valor: string;
  cantidadVariantes: number;
}

export interface Atributo {
  idAtributo: number;
  nombre: string;
  cantidadValores: number;
  valores: ValorAtributo[];
}

export interface AtributoCreado {
  idAtributo: number;
  nombre: string;
}

export interface ValorAtributoCreado {
  idValorAtributo: number;
  idAtributo: number;
  atributo: string;
  valor: string;
}
