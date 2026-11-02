import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { paramsId } from '../../shared/utils/esquemas.js';
import { cuponesController as c } from './cupones.controller.js';
import { cuponBody, estadoBody, listarCuponesQuery, listarUsosQuery } from './cupones.schemas.js';

/** Montado en /api/cupones. Solo Administrador (401 sin token, 403 con otro rol). */
export const cuponesRoutes = Router();

cuponesRoutes.use(authenticate, authorize('Administrador'));
cuponesRoutes.get('/', validate({ query: listarCuponesQuery }), c.listar);
cuponesRoutes.get('/:id', validate({ params: paramsId }), c.obtener);
cuponesRoutes.post('/', validate({ body: cuponBody }), c.crear);
cuponesRoutes.put('/:id', validate({ params: paramsId, body: cuponBody }), c.actualizar);
cuponesRoutes.patch(
  '/:id/estado',
  validate({ params: paramsId, body: estadoBody }),
  c.cambiarEstado,
);
cuponesRoutes.delete('/:id', validate({ params: paramsId }), c.eliminar);
cuponesRoutes.get('/:id/usos', validate({ params: paramsId, query: listarUsosQuery }), c.usos);
