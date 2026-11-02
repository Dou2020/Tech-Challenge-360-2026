import { Router, type RequestHandler } from 'express';
import { authenticate, authenticateOpcional } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { guestCart } from '../../middlewares/guestCart.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../shared/errors/AppError.js';
import { carritoController as c } from './carrito.controller.js';
import {
  actualizarItemBody,
  agregarItemBody,
  aplicarCuponBody,
  fusionarBody,
  paramsItem,
} from './carrito.schemas.js';

/**
 * Montado en /api/carrito.
 *  - Invitado o Cliente (GET /, items, DELETE /): `authenticateOpcional` + `guestCart`. Con sesión,
 *    solo un Cliente tiene carrito (Operador y Administrador → 403) y el X-Cart-Token se ignora.
 *  - Solo Cliente (cupón y fusión): 401 sin token, 403 con otro rol.
 */
export const carritoRoutes = Router();

/** Con sesión, el carrito es solo de Clientes. Sin sesión pasa (invitado). */
const soloClienteSiHaySesion: RequestHandler = (req, _res, next) => {
  if (req.usuario && req.usuario.rol !== 'Cliente') {
    next(new AppError('PROHIBIDO', 'Solo los clientes tienen carrito de compras.'));
    return;
  }
  next();
};

const invitadoOCliente = [authenticateOpcional, guestCart, soloClienteSiHaySesion];
const soloCliente = [authenticate, authorize('Cliente')];

carritoRoutes.get('/', ...invitadoOCliente, c.obtener);
carritoRoutes.post(
  '/items',
  ...invitadoOCliente,
  validate({ body: agregarItemBody }),
  c.agregarItem,
);
carritoRoutes.patch(
  '/items/:idVariante',
  ...invitadoOCliente,
  validate({ params: paramsItem, body: actualizarItemBody }),
  c.actualizarItem,
);
carritoRoutes.delete(
  '/items/:idVariante',
  ...invitadoOCliente,
  validate({ params: paramsItem }),
  c.eliminarItem,
);
carritoRoutes.delete('/', ...invitadoOCliente, c.vaciar);

carritoRoutes.post('/cupon', ...soloCliente, validate({ body: aplicarCuponBody }), c.aplicarCupon);
carritoRoutes.delete('/cupon', ...soloCliente, c.quitarCupon);
carritoRoutes.post(
  '/fusionar',
  ...soloCliente,
  guestCart,
  validate({ body: fusionarBody }),
  c.fusionar,
);
