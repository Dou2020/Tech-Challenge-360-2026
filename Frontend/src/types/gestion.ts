/** Gestión del catálogo (Administrador): categorías, productos, variantes y atributos. Ver Backend/API.md. */
import type { ImagenProducto, ValorVariante } from './catalogo';

export interface CategoriaGestion {
  idCategoria: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  cantidadProductos: number;
  cantidadCupones: number;
}

export interface DatosCategoria {
  nombre: string;
  descripcion?: string;
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

export interface VarianteGestion {
  idVariante: number;
  idProducto: number;
  sku: string;
  precio: string;
  existenciaFisica: number;
  existenciaReservada: number;
  existenciaDisponible: number;
  activo: boolean;
  descripcion: string | null;
  valores: ValorVariante[];
}

export interface ProductoGestion {
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
  puedeEliminarse: boolean;
  variantes: VarianteGestion[];
  imagenes: ImagenProducto[];
}

export interface DatosProducto {
  idCategoria: number;
  nombre: string;
  descripcion?: string;
}

export interface DatosVarianteNueva {
  sku: string;
  /** String decimal con hasta 2 decimales ("249.00"). */
  precio: string;
  existenciaInicial: number;
  valores: number[];
}

export interface DatosProductoNuevo extends DatosProducto {
  variantes: DatosVarianteNueva[];
}

export interface DatosImagen {
  url: string;
  orden: number;
  esPrincipal: boolean;
}

/** Subida de una imagen como archivo (multipart) a POST /api/productos/:id/imagenes/archivo. */
export interface DatosImagenArchivo {
  archivo: File;
  orden: number;
  esPrincipal: boolean;
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
