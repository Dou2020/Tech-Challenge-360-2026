import type { Request, RequestHandler, Response } from 'express';
import type { TarjetaBody } from './tarjetas.schemas.js';
import { tarjetasService } from './tarjetas.service.js';

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

export const tarjetasController = {
  listar: (async (req, res) => {
    res.json(await tarjetasService.listar(idCliente(req)));
  }) satisfies RequestHandler,

  crear: (async (req, res) => {
    const { body } = validado<{ body: TarjetaBody }>(res);
    res.status(201).json(await tarjetasService.crear(idCliente(req), body));
  }) satisfies RequestHandler,

  marcarPredeterminada: (async (req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    res.json(await tarjetasService.marcarPredeterminada(idCliente(req), params.id));
  }) satisfies RequestHandler,

  eliminar: (async (req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    await tarjetasService.eliminar(idCliente(req), params.id);
    res.status(204).end();
  }) satisfies RequestHandler,
};
