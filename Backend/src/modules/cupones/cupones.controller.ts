import type { Request, RequestHandler, Response } from 'express';
import type {
  CuponBody,
  EstadoBody,
  ListarCuponesQuery,
  ListarUsosQuery,
} from './cupones.schemas.js';
import { cuponesService } from './cupones.service.js';

interface ParamsId {
  id: number;
}

/** Valores validados por `validate` (con coerciones y defaults). */
function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

/** Id del Administrador que hace la petición (del JWT). */
function idSolicitante(req: Request): number {
  return req.usuario!.idUsuario;
}

export const cuponesController = {
  listar: (async (_req, res) => {
    const { query } = validado<{ query: ListarCuponesQuery }>(res);
    const { page, pageSize, sort, ...filtros } = query;
    res.json(await cuponesService.listar(filtros, { page, pageSize, sort }));
  }) satisfies RequestHandler,

  obtener: (async (_req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    res.json(await cuponesService.obtener(params.id));
  }) satisfies RequestHandler,

  crear: (async (req, res) => {
    const { body } = validado<{ body: CuponBody }>(res);
    const creado = await cuponesService.crear(idSolicitante(req), body);
    res.status(201).location(`/api/cupones/${creado.idCupon}`).json(creado);
  }) satisfies RequestHandler,

  actualizar: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: CuponBody }>(res);
    res.json(await cuponesService.actualizar(idSolicitante(req), params.id, body));
  }) satisfies RequestHandler,

  cambiarEstado: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: EstadoBody }>(res);
    res.json(await cuponesService.cambiarEstado(idSolicitante(req), params.id, body.activo));
  }) satisfies RequestHandler,

  eliminar: (async (req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    await cuponesService.eliminar(idSolicitante(req), params.id);
    res.status(204).end();
  }) satisfies RequestHandler,

  usos: (async (_req, res) => {
    const { params, query } = validado<{ params: ParamsId; query: ListarUsosQuery }>(res);
    res.json(await cuponesService.listarUsos(params.id, query));
  }) satisfies RequestHandler,
};
