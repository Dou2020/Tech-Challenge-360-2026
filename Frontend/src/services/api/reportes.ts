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

/** Máximo `pageSize` que acepta la API (TAMANO_PAGINA_MAXIMO del backend). */
export const TAMANO_PAGINA_EXPORTACION = 100;

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

  /** Todos los carritos abandonados del periodo (para exportar): recorre las páginas de 100. */
  todosLosCarritosAbandonados: async (params: Params): Promise<CarritoAbandonado[]> => {
    const filas: CarritoAbandonado[] = [];
    for (let page = 1; ; page++) {
      const pagina = await reportesApi.carritosAbandonados({
        ...params,
        page,
        pageSize: TAMANO_PAGINA_EXPORTACION,
      });
      filas.push(...pagina.items);
      if (pagina.items.length === 0 || filas.length >= pagina.total) return filas;
    }
  },
};
