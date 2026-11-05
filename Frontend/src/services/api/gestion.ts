import type { Page } from '../../types/api';
import type {
  Atributo,
  CategoriaGestion,
  DatosCategoria,
  DatosImagen,
  DatosImagenArchivo,
  DatosProducto,
  DatosProductoNuevo,
  DatosVarianteNueva,
  ProductoGestion,
  ProductoListado,
  VarianteGestion,
} from '../../types/gestion';
import { request } from '../http';
import { construirQuery } from './consulta';

type Params = Record<string, string | number | undefined>;

/** Cuerpo de un cambio de estado. */
const estado = (activo: boolean) => ({ method: 'PATCH', body: { activo } }) as const;

/** Categorías de gestión (incluye inactivas). Distintas de `catalogoApi.categorias`, que es público. */
export const categoriasApi = {
  listar: (params: Params) =>
    request<Page<CategoriaGestion>>(`/categorias${construirQuery(params)}`),
  crear: (datos: DatosCategoria) =>
    request<CategoriaGestion>('/categorias', { method: 'POST', body: datos }),
  actualizar: (id: number, datos: DatosCategoria) =>
    request<CategoriaGestion>(`/categorias/${id}`, { method: 'PUT', body: datos }),
  cambiarEstado: (id: number, activo: boolean) =>
    request<CategoriaGestion>(`/categorias/${id}/estado`, estado(activo)),
  eliminar: (id: number) => request<void>(`/categorias/${id}`, { method: 'DELETE' }),
};

/** Productos de gestión: incluye inactivos, todas las variantes y su existencia. */
export const productosApi = {
  listar: (params: Params) => request<Page<ProductoListado>>(`/productos${construirQuery(params)}`),
  obtener: (id: number) => request<ProductoGestion>(`/productos/${id}`),
  crear: (datos: DatosProductoNuevo) =>
    request<ProductoGestion>('/productos', { method: 'POST', body: datos }),
  actualizar: (id: number, datos: DatosProducto) =>
    request<ProductoGestion>(`/productos/${id}`, { method: 'PUT', body: datos }),
  cambiarEstado: (id: number, activo: boolean) =>
    request<ProductoGestion>(`/productos/${id}/estado`, estado(activo)),
  eliminar: (id: number) => request<void>(`/productos/${id}`, { method: 'DELETE' }),
  agregarImagen: (id: number, datos: DatosImagen) =>
    request<ProductoGestion>(`/productos/${id}/imagenes`, { method: 'POST', body: datos }),
  /** Sube el archivo en el campo `imagen` (JPEG, PNG o WebP); `http.ts` deja el multipart intacto. */
  subirImagen: (id: number, { archivo, orden, esPrincipal }: DatosImagenArchivo) => {
    const formulario = new FormData();
    formulario.append('imagen', archivo);
    formulario.append('orden', String(orden));
    formulario.append('esPrincipal', esPrincipal ? 'true' : 'false');
    return request<ProductoGestion>(`/productos/${id}/imagenes/archivo`, {
      method: 'POST',
      body: formulario,
    });
  },
  quitarImagen: (id: number, idImagen: number) =>
    request<void>(`/productos/${id}/imagenes/${idImagen}`, { method: 'DELETE' }),
  agregarVariante: (id: number, datos: DatosVarianteNueva) =>
    request<VarianteGestion>(`/productos/${id}/variantes`, { method: 'POST', body: datos }),
};

export const variantesApi = {
  actualizar: (id: number, datos: { sku: string; valores: number[] }) =>
    request<VarianteGestion>(`/variantes/${id}`, { method: 'PUT', body: datos }),
  cambiarPrecio: (id: number, precio: string) =>
    request<VarianteGestion>(`/variantes/${id}/precio`, { method: 'PATCH', body: { precio } }),
  cambiarEstado: (id: number, activo: boolean) =>
    request<VarianteGestion>(`/variantes/${id}/estado`, estado(activo)),
};

export const atributosApi = {
  listar: () => request<Atributo[]>('/atributos'),
  crear: (nombre: string) =>
    request<{ idAtributo: number; nombre: string }>('/atributos', {
      method: 'POST',
      body: { nombre },
    }),
  agregarValor: (idAtributo: number, valor: string) =>
    request<{ idValorAtributo: number; idAtributo: number; atributo: string; valor: string }>(
      `/atributos/${idAtributo}/valores`,
      { method: 'POST', body: { valor } },
    ),
};
