import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { pedidosController as c } from './pedidos.controller.js';
import {
  cambiarEstadoBody,
  cancelarBody,
  devolucionBody,
  listarPedidosQuery,
  paramsPedido,
} from './pedidos.schemas.js';

/**
 * Montado en /api/pedidos. El Cliente solo alcanza sus pedidos (el SP responde 404 con uno
 * ajeno); Operador y Administrador, todos. Cambiar el estado y devolver son del personal.
 */
export const pedidosRoutes = Router();

const cualquierRol = authorize('Cliente', 'Operador', 'Administrador');
const personal = authorize('Operador', 'Administrador');

pedidosRoutes.use(authenticate);
// /estados va antes de /:id para que no se lea "estados" como un id.
pedidosRoutes.get('/estados', c.estados);
pedidosRoutes.get('/', cualquierRol, validate({ query: listarPedidosQuery }), c.listar);
pedidosRoutes.get('/:id', cualquierRol, validate({ params: paramsPedido }), c.obtener);
pedidosRoutes.get('/:id/historial', cualquierRol, validate({ params: paramsPedido }), c.historial);
pedidosRoutes.post(
  '/:id/cancelar',
  cualquierRol,
  validate({ params: paramsPedido, body: cancelarBody }),
  c.cancelar,
);
pedidosRoutes.patch(
  '/:id/estado',
  personal,
  validate({ params: paramsPedido, body: cambiarEstadoBody }),
  c.cambiarEstado,
);
pedidosRoutes.get(
  '/:id/devoluciones',
  cualquierRol,
  validate({ params: paramsPedido }),
  c.listarDevoluciones,
);
pedidosRoutes.post(
  '/:id/devoluciones',
  personal,
  validate({ params: paramsPedido, body: devolucionBody }),
  c.registrarDevolucion,
);
