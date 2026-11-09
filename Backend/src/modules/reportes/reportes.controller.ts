import type { RequestHandler, Response } from 'express';
import type { ResultadoCache } from '../../shared/cache/cache.js';
import { transmitirEventos } from '../../shared/eventos/transmitir.js';
import type {
  CarritosQuery,
  RangoQuery,
  TopProductosQuery,
  VentasQuery,
} from './reportes.schemas.js';
import { reportesService } from './reportes.service.js';

function validado<T>(res: Response): T {
  return (res.locals.validado as { query: T }).query;
}

function responder<T>(res: Response, { valor, hit }: ResultadoCache<T>): void {
  res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
  res.json(valor);
}

export const reportesController = {
  /** Stream SSE de avisos de cambio en los pedidos, sin filtro (solo Administrador). */
  stream: (async (req, res) => {
    await transmitirEventos(req, res);
  }) satisfies RequestHandler,

  resumen: (async (_req, res) => {
    responder(res, await reportesService.resumen(validado<RangoQuery>(res)));
  }) satisfies RequestHandler,

  ventas: (async (_req, res) => {
    const { agrupacion, ...rango } = validado<VentasQuery>(res);
    responder(res, await reportesService.ventas(agrupacion, rango));
  }) satisfies RequestHandler,

  ventasPorCategoria: (async (_req, res) => {
    responder(res, await reportesService.ventasPorCategoria(validado<RangoQuery>(res)));
  }) satisfies RequestHandler,

  productosMasVendidos: (async (_req, res) => {
    const { limite, ...rango } = validado<TopProductosQuery>(res);
    responder(res, await reportesService.productosMasVendidos(limite, rango));
  }) satisfies RequestHandler,

  carritosAbandonados: (async (_req, res) => {
    const { page, pageSize, sort, ...rango } = validado<CarritosQuery>(res);
    responder(res, await reportesService.carritosAbandonados(rango, { page, pageSize, sort }));
  }) satisfies RequestHandler,
};
