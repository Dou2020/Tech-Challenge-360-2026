import type { Request, RequestHandler, Response } from 'express';
import type {
  EstadoSucursalBody,
  ListarSucursalesQuery,
  SucursalBody,
} from './sucursales.schemas.js';
import { sucursalesService } from './sucursales.service.js';

interface ParamsId {
  id: number;
}

/** Valores validados por `validate` (con coerciones y defaults). */
function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

/** Id del Administrador que hace la petición (del JWT; `authenticate` ya lo exigió). */
function idSolicitante(req: Request): number {
  return req.usuario!.idUsuario;
}

export const sucursalesController = {
  publicas: (async (_req, res) => {
    const { valor, hit } = await sucursalesService.listarPublicas();
    res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
    res.json(valor);
  }) satisfies RequestHandler,

  listar: (async (req, res) => {
    const { query } = validado<{ query: ListarSucursalesQuery }>(res);
    const { page, pageSize, sort, ...filtros } = query;
    res.json(await sucursalesService.listar(idSolicitante(req), filtros, { page, pageSize, sort }));
  }) satisfies RequestHandler,

  obtener: (async (_req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    res.json(await sucursalesService.obtener(params.id));
  }) satisfies RequestHandler,

  crear: (async (req, res) => {
    const { body } = validado<{ body: SucursalBody }>(res);
    res.status(201).json(await sucursalesService.crear(idSolicitante(req), body));
  }) satisfies RequestHandler,

  actualizar: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: SucursalBody }>(res);
    res.json(await sucursalesService.actualizar(idSolicitante(req), params.id, body));
  }) satisfies RequestHandler,

  cambiarEstado: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: EstadoSucursalBody }>(res);
    res.json(await sucursalesService.cambiarEstado(idSolicitante(req), params.id, body.activo));
  }) satisfies RequestHandler,

  eliminar: (async (req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    await sucursalesService.eliminar(idSolicitante(req), params.id);
    res.status(204).end();
  }) satisfies RequestHandler,
};
