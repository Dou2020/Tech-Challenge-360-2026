import type { Request, RequestHandler, Response } from 'express';
import type { IniciarBody, PagarBody, ResumenQuery } from './checkout.schemas.js';
import { checkoutService } from './checkout.service.js';

/** Valores validados por `validate` (con coerciones y defaults). */
function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

/** Id del Cliente: siempre del JWT. */
function idCliente(req: Request): number {
  return req.usuario!.idUsuario;
}

export const checkoutController = {
  iniciar: (async (req, res) => {
    const { body } = validado<{ body: IniciarBody }>(res);
    res.json(await checkoutService.iniciar(idCliente(req), body.idDireccion, body.idMetodoEnvio));
  }) satisfies RequestHandler,

  obtenerResumen: (async (req, res) => {
    const { query } = validado<{ query: ResumenQuery }>(res);
    res.json(await checkoutService.obtenerResumen(idCliente(req), query.idMetodoEnvio));
  }) satisfies RequestHandler,

  liberarReserva: (async (req, res) => {
    await checkoutService.liberarReserva(idCliente(req));
    res.status(204).end();
  }) satisfies RequestHandler,

  pagar: (async (req, res) => {
    const { body } = validado<{ body: PagarBody }>(res);
    const { pedido, creado } = await checkoutService.pagar(idCliente(req), req.claveIdempotencia!, {
      idDireccion: body.idDireccion,
      idMetodoEnvio: body.idMetodoEnvio,
      metodoPago: body.metodoPago,
      titular: body.datosPago.titular,
      ultimos4: body.datosPago.ultimos4,
    });
    res
      .location(`/api/pedidos/${pedido.idPedido}`)
      .status(creado ? 201 : 200)
      .json(pedido);
  }) satisfies RequestHandler,
};
