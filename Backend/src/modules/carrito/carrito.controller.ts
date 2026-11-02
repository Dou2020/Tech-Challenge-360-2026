import type { Request, RequestHandler, Response } from 'express';
import type {
  ActualizarItemBody,
  AgregarItemBody,
  AplicarCuponBody,
  FusionarBody,
  ParamsItem,
} from './carrito.schemas.js';
import { carritoService, elegirPropietario } from './carrito.service.js';

/** Valores validados por `validate` (con coerciones y defaults). */
function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

/** Dueño del carrito: el usuario del JWT si hay sesión; si no, el X-Cart-Token. */
function dueno(req: Request) {
  return elegirPropietario(req.usuario?.idUsuario, req.tokenCarrito);
}

/** Id del Cliente: siempre del JWT. */
function idCliente(req: Request): number {
  return req.usuario!.idUsuario;
}

export const carritoController = {
  obtener: (async (req, res) => {
    res.json(await carritoService.obtener(dueno(req)));
  }) satisfies RequestHandler,

  agregarItem: (async (req, res) => {
    const { body } = validado<{ body: AgregarItemBody }>(res);
    res.json(await carritoService.agregarItem(dueno(req), body.idVariante, body.cantidad));
  }) satisfies RequestHandler,

  actualizarItem: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsItem; body: ActualizarItemBody }>(res);
    res.json(await carritoService.actualizarCantidad(dueno(req), params.idVariante, body.cantidad));
  }) satisfies RequestHandler,

  eliminarItem: (async (req, res) => {
    const { params } = validado<{ params: ParamsItem }>(res);
    res.json(await carritoService.eliminarItem(dueno(req), params.idVariante));
  }) satisfies RequestHandler,

  vaciar: (async (req, res) => {
    res.json(await carritoService.vaciar(dueno(req)));
  }) satisfies RequestHandler,

  aplicarCupon: (async (req, res) => {
    const { body } = validado<{ body: AplicarCuponBody }>(res);
    res.json(await carritoService.aplicarCupon(idCliente(req), body.codigo));
  }) satisfies RequestHandler,

  quitarCupon: (async (req, res) => {
    res.json(await carritoService.quitarCupon(idCliente(req)));
  }) satisfies RequestHandler,

  fusionar: (async (req, res) => {
    const { body } = validado<{ body: FusionarBody }>(res);
    res.json(await carritoService.fusionar(idCliente(req), body.tokenInvitado, req.tokenCarrito));
  }) satisfies RequestHandler,
};
