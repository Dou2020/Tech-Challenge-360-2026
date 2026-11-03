import type { Page } from '../../types/api';
import type {
  Categoria,
  MetodoEnvio,
  ProductoDetalle,
  ProductoResumen,
} from '../../types/catalogo';
import { request } from '../http';
import { construirQuery } from './consulta';

/** Endpoints públicos del catálogo (ver Backend/API.md, "Catálogo público"). */
export const catalogoApi = {
  categorias: () => request<Categoria[]>('/catalogo/categorias'),

  buscarProductos: (params: Record<string, string | number | undefined>) =>
    request<Page<ProductoResumen>>(`/catalogo/productos${construirQuery(params)}`),

  producto: (idProducto: number) => request<ProductoDetalle>(`/catalogo/productos/${idProducto}`),

  metodosEnvio: () => request<MetodoEnvio[]>('/metodos-envio'),
};
