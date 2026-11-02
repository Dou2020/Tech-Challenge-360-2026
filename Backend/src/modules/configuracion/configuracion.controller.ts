import type { Request, RequestHandler, Response } from 'express';
import type { ParamsClave, ValorBody } from './configuracion.schemas.js';
import { configuracionService } from './configuracion.service.js';

function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

function idSolicitante(req: Request): number {
  return req.usuario!.idUsuario;
}

export const configuracionController = {
  listar: (async (_req, res) => {
    const { valor, hit } = await configuracionService.listar();
    res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
    res.json(valor);
  }) satisfies RequestHandler,

  actualizar: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsClave; body: ValorBody }>(res);
    res.json(await configuracionService.actualizar(idSolicitante(req), params.clave, body.valor));
  }) satisfies RequestHandler,
};
