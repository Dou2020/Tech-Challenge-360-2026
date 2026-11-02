import type { Request, RequestHandler, Response } from 'express';
import type {
  ActualizarUsuarioBody,
  CrearUsuarioBody,
  EstadoUsuarioBody,
  ListarUsuariosQuery,
} from './usuarios.schemas.js';
import { usuariosService } from './usuarios.service.js';

interface ParamsId {
  id: number;
}

function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

/** Id del Administrador que hace la petición (del JWT). */
function idSolicitante(req: Request): number {
  return req.usuario!.idUsuario;
}

export const usuariosController = {
  listar: (async (_req, res) => {
    const { query } = validado<{ query: ListarUsuariosQuery }>(res);
    const { page, pageSize, sort, ...filtros } = query;
    res.json(await usuariosService.listar(filtros, { page, pageSize, sort }));
  }) satisfies RequestHandler,

  obtener: (async (_req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    res.json(await usuariosService.obtener(params.id));
  }) satisfies RequestHandler,

  crear: (async (req, res) => {
    const { body } = validado<{ body: CrearUsuarioBody }>(res);
    const creado = await usuariosService.crear(idSolicitante(req), body);
    res.status(201).location(`/api/usuarios/${creado.idUsuario}`).json(creado);
  }) satisfies RequestHandler,

  reenviarInvitacion: (async (_req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    await usuariosService.reenviarInvitacion(params.id);
    res.status(202).json({ mensaje: 'Invitación enviada. El enlace anterior dejó de servir.' });
  }) satisfies RequestHandler,

  actualizar: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: ActualizarUsuarioBody }>(res);
    res.json(await usuariosService.actualizar(idSolicitante(req), params.id, body));
  }) satisfies RequestHandler,

  cambiarEstado: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: EstadoUsuarioBody }>(res);
    res.json(await usuariosService.cambiarEstado(idSolicitante(req), params.id, body.activo));
  }) satisfies RequestHandler,
};
