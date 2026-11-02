import type { Request, RequestHandler, Response } from 'express';
import type { CambioContrasenaBody, PerfilBody } from './perfil.schemas.js';
import { perfilService } from './perfil.service.js';

function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

/** El usuario sale siempre del token. */
function idUsuario(req: Request): number {
  return req.usuario!.idUsuario;
}

export const perfilController = {
  obtener: (async (req, res) => {
    res.json(await perfilService.obtener(idUsuario(req)));
  }) satisfies RequestHandler,

  actualizar: (async (req, res) => {
    const { body } = validado<{ body: PerfilBody }>(res);
    res.json(await perfilService.actualizar(idUsuario(req), body));
  }) satisfies RequestHandler,

  cambiarContrasena: (async (req, res) => {
    const { body } = validado<{ body: CambioContrasenaBody }>(res);
    await perfilService.cambiarContrasena(idUsuario(req), req.usuario!.sid, body);
    res.status(204).end();
  }) satisfies RequestHandler,
};
