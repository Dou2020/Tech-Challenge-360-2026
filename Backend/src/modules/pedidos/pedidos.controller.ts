import type { Request, RequestHandler, Response } from 'express';
import type {
  CambiarEstadoBody,
  CancelarBody,
  DevolucionBody,
  ListarPedidosQuery,
  ParamsPedido,
} from './pedidos.schemas.js';
import { pedidosService } from './pedidos.service.js';

/** Valores validados por `validate` (con coerciones y defaults). */
function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

/** Solicitante: siempre del JWT (nunca de la URL ni del body). */
function idSolicitante(req: Request): number {
  return req.usuario!.idUsuario;
}

export const pedidosController = {
  listar: (async (req, res) => {
    const { query } = validado<{ query: ListarPedidosQuery }>(res);
    const { page, pageSize, sort, ...filtros } = query;
    res.json(await pedidosService.listar(idSolicitante(req), filtros, { page, pageSize, sort }));
  }) satisfies RequestHandler,

  estados: (async (req, res) => {
    res.json(await pedidosService.listarEstados(idSolicitante(req)));
  }) satisfies RequestHandler,

  obtener: (async (req, res) => {
    const { params } = validado<{ params: ParamsPedido }>(res);
    res.json(await pedidosService.obtener(idSolicitante(req), params.id));
  }) satisfies RequestHandler,

  historial: (async (req, res) => {
    const { params } = validado<{ params: ParamsPedido }>(res);
    res.json(await pedidosService.historial(idSolicitante(req), params.id));
  }) satisfies RequestHandler,

  cancelar: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsPedido; body: CancelarBody }>(res);
    res.json(await pedidosService.cancelar(idSolicitante(req), params.id, body.motivo));
  }) satisfies RequestHandler,

  cambiarEstado: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsPedido; body: CambiarEstadoBody }>(res);
    res.json(
      await pedidosService.cambiarEstado(
        idSolicitante(req),
        params.id,
        body.estado,
        body.comentario,
      ),
    );
  }) satisfies RequestHandler,

  listarDevoluciones: (async (req, res) => {
    const { params } = validado<{ params: ParamsPedido }>(res);
    res.json(await pedidosService.listarDevoluciones(idSolicitante(req), params.id));
  }) satisfies RequestHandler,

  registrarDevolucion: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsPedido; body: DevolucionBody }>(res);
    res
      .status(201)
      .json(
        await pedidosService.registrarDevolucion(
          idSolicitante(req),
          params.id,
          body.motivo,
          body.lineas,
        ),
      );
  }) satisfies RequestHandler,
};
