import type { RequestHandler, Response } from 'express';
import type { ListarBitacoraQuery } from './bitacora.schemas.js';
import { bitacoraService } from './bitacora.service.js';

function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

export const bitacoraController = {
  listar: (async (_req, res) => {
    const { query } = validado<{ query: ListarBitacoraQuery }>(res);
    const { page, pageSize, sort, ...filtros } = query;
    res.json(await bitacoraService.listar(filtros, { page, pageSize, sort }));
  }) satisfies RequestHandler,

  modulos: (async (_req, res) => {
    res.json(await bitacoraService.listarModulos());
  }) satisfies RequestHandler,
};
