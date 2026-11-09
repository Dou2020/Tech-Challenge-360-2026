/** Tipos del catálogo público (ver Backend/API.md, "Catálogo público"). Montos como string decimal. */

export interface Categoria {
  idCategoria: number;
  nombre: string;
  descripcion: string | null;
  cantidadProductos: number;
}

export interface ProductoResumen {
  idProducto: number;
  nombre: string;
  descripcion: string | null;
  idCategoria: number;
  categoria: string;
  precioMinimo: string;
  precioMaximo: string;
  disponible: boolean;
  imagenPrincipal: string | null;
  fechaCreacion: string;
}

export interface ImagenProducto {
  idProductoImagen: number;
  url: string;
  orden: number;
  esPrincipal: boolean;
}

export interface ValorVariante {
  idAtributo: number;
  atributo: string;
  idValorAtributo: number;
  valor: string;
}

export interface Variante {
  idVariante: number;
  sku: string;
  precio: string;
  existenciaDisponible: number;
  descripcion: string | null;
  valores: ValorVariante[];
}

/** El detalle no trae `imagenPrincipal`: sus imágenes vienen completas en `imagenes`. */
export interface ProductoDetalle extends Omit<ProductoResumen, 'imagenPrincipal'> {
  imagenes: ImagenProducto[];
  variantes: Variante[];
}

export interface MetodoEnvio {
  idMetodoEnvio: number;
  nombre: string;
  costo: string;
  diasEstimados: number;
  /** true en "Recoger en sucursal": exige elegir sucursal en vez de dirección. */
  requiereSucursal: boolean;
}

/** Filtros de GET /api/catalogo/productos. */
export interface FiltrosProductos {
  q?: string;
  idCategoria?: string;
  precioMin?: string;
  precioMax?: string;
  disponible?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}
