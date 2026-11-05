import type { Page } from '../../types/api';
import type {
  Agrupacion,
  CarritoAbandonado,
  ProductoVendido,
  ResumenReportes,
  VentaCategoria,
  VentaPeriodo,
} from '../../types/reportes';
import { request } from '../http';
import { construirQuery } from './consulta';

type Params = Record<string, string | number | undefined>;

/** Endpoints de /api/reportes (Administrador). `desde` y `hasta` son días de Guatemala (YYYY-MM-DD). */
export const reportesApi = {
  resumen: (params: Params) =>
    request<ResumenReportes>(`/reportes/resumen${construirQuery(params)}`),

  ventas: (params: Params & { agrupacion?: Agrupacion }) =>
    request<VentaPeriodo[]>(`/reportes/ventas${construirQuery(params)}`),

  ventasPorCategoria: (params: Params) =>
    request<VentaCategoria[]>(`/reportes/ventas-por-categoria${construirQuery(params)}`),

  productosMasVendidos: (params: Params) =>
    request<ProductoVendido[]>(`/reportes/productos-mas-vendidos${construirQuery(params)}`),

  carritosAbandonados: (params: Params) =>
    request<Page<CarritoAbandonado>>(`/reportes/carritos-abandonados${construirQuery(params)}`),
};
