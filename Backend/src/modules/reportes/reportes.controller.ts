import type { RequestHandler, Response } from 'express';
import { eventos } from '../../shared/eventos/eventos.js';
import type { ResultadoCache } from '../../shared/cache/cache.js';
import type {
  CarritosQuery,
  RangoQuery,
  TopProductosQuery,
  VentasQuery,
} from './reportes.schemas.js';
import { abrirStream } from './reportes.stream.js';
import { reportesService } from './reportes.service.js';

function validado<T>(res: Response): T {
  return (res.locals.validado as { query: T }).query;
}

function responder<T>(res: Response, { valor, hit }: ResultadoCache<T>): void {
  res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
  res.json(valor);
}

export const reportesController = {
  /**
   * Stream SSE de avisos de cambio en los pedidos. Si el límite o la suscripción fallan
   * responde el error normal (429/503) porque aún no se escribió ningún header.
   */
  stream: (async (req, res) => {
    const usuario = req.usuario!;
    const conexion = await abrirStream(
      usuario,
      {
        abrir: () => {
          res.status(200).set({
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          });
          res.flushHeaders();
        },
        escribir: (texto) => {
          res.write(texto);
        },
        terminar: () => {
          res.end();
        },
      },
      (oyente) => eventos.suscribir(oyente),
    );
    req.on('close', conexion.liberar);
    if (req.destroyed) conexion.liberar();
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
