import type { Request, RequestHandler, Response } from 'express';
import type {
  AjusteBody,
  EntradaBody,
  KardexQuery,
  ListarExistenciasQuery,
  ParamsVariante,
} from './inventario.schemas.js';
import { inventarioService } from './inventario.service.js';

/** Valores validados por `validate` (con coerciones y defaults). */
function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

/** Id del Operador o Administrador que hace la petición (del JWT). */
function idSolicitante(req: Request): number {
  return req.usuario!.idUsuario;
}

export const inventarioController = {
  tiposMovimiento: (async (_req, res) => {
    res.json(await inventarioService.listarTiposMovimiento());
  }) satisfies RequestHandler,

  existencias: (async (_req, res) => {
    const { query } = validado<{ query: ListarExistenciasQuery }>(res);
    const { page, pageSize, sort, ...filtros } = query;
    res.json(await inventarioService.listarExistencias(filtros, { page, pageSize, sort }));
  }) satisfies RequestHandler,

  kardex: (async (_req, res) => {
    const { params, query } = validado<{ params: ParamsVariante; query: KardexQuery }>(res);
    const { page, pageSize, sort, ...filtros } = query;
    res.json(
      await inventarioService.consultarKardex(params.idVariante, filtros, { page, pageSize, sort }),
    );
  }) satisfies RequestHandler,

  registrarEntrada: (async (req, res) => {
    const { body } = validado<{ body: EntradaBody }>(res);
    res.status(201).json(await inventarioService.registrarEntrada(idSolicitante(req), body));
  }) satisfies RequestHandler,

  registrarAjuste: (async (req, res) => {
    const { body } = validado<{ body: AjusteBody }>(res);
    res.status(201).json(await inventarioService.registrarAjuste(idSolicitante(req), body));
  }) satisfies RequestHandler,
};
