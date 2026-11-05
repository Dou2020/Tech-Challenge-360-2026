import type { Page } from '../../types/api';
import type {
  DatosAjuste,
  DatosEntrada,
  Existencia,
  Movimiento,
  MovimientoRegistrado,
  TipoMovimiento,
} from '../../types/inventario';
import { request } from '../http';
import { construirQuery } from './consulta';

type Params = Record<string, string | number | boolean | undefined>;

/** Endpoints de /api/inventario (Operador y Administrador). */
export const inventarioApi = {
  existencias: (params: Params) =>
    request<Page<Existencia>>(`/inventario/existencias${construirQuery(params)}`),

  kardex: (idVariante: number, params: Params) =>
    request<Page<Movimiento>>(
      `/inventario/variantes/${idVariante}/kardex${construirQuery(params)}`,
    ),

  tiposMovimiento: () => request<TipoMovimiento[]>('/inventario/tipos-movimiento'),

  registrarEntrada: (datos: DatosEntrada) =>
    request<MovimientoRegistrado>('/inventario/entradas', { method: 'POST', body: datos }),

  registrarAjuste: (datos: DatosAjuste) =>
    request<MovimientoRegistrado>('/inventario/ajustes', { method: 'POST', body: datos }),
};
