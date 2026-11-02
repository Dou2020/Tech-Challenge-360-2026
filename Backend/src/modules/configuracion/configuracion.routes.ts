import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { configuracionController as c } from './configuracion.controller.js';
import { paramsClave, valorBody } from './configuracion.schemas.js';

/** Montado en /api/configuracion. Solo Administrador. */
export const configuracionRoutes = Router();

configuracionRoutes.use(authenticate, authorize('Administrador'));
configuracionRoutes.get('/', c.listar);
configuracionRoutes.put(
  '/:clave',
  validate({ params: paramsClave, body: valorBody }),
  c.actualizar,
);
