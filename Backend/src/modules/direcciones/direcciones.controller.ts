import type { Request, RequestHandler, Response } from 'express';
import type { DireccionBody } from './direcciones.schemas.js';
import { direccionesService } from './direcciones.service.js';

interface ParamsId {
  id: number;
}

/** Valores validados por `validate` (con coerciones y defaults). */
function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

/** Id del Cliente: siempre del JWT, nunca de la URL ni del body. */
function idCliente(req: Request): number {
  return req.usuario!.idUsuario;
}

export const direccionesController = {
  listar: (async (req, res) => {
    res.json(await direccionesService.listar(idCliente(req)));
  }) satisfies RequestHandler,

  obtener: (async (req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    res.json(await direccionesService.obtener(idCliente(req), params.id));
  }) satisfies RequestHandler,

  crear: (async (req, res) => {
    const { body } = validado<{ body: DireccionBody }>(res);
    const creada = await direccionesService.crear(idCliente(req), body);
    res.status(201).location(`/api/direcciones/${creada.idDireccion}`).json(creada);
  }) satisfies RequestHandler,

  actualizar: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: DireccionBody }>(res);
    res.json(await direccionesService.actualizar(idCliente(req), params.id, body));
  }) satisfies RequestHandler,

  eliminar: (async (req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    await direccionesService.eliminar(idCliente(req), params.id);
    res.status(204).end();
  }) satisfies RequestHandler,
};
