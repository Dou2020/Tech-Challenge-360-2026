import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { paramsId } from '../../shared/utils/esquemas.js';
import { direccionesController as c } from './direcciones.controller.js';
import { direccionBody } from './direcciones.schemas.js';

/**
 * Montado en /api/direcciones. Solo Cliente (401 sin token, 403 con otro rol); cada cliente ve
 * únicamente sus direcciones activas y la de otro responde 404.
 */
export const direccionesRoutes = Router();

direccionesRoutes.use(authenticate, authorize('Cliente'));
direccionesRoutes.get('/', c.listar);
direccionesRoutes.get('/:id', validate({ params: paramsId }), c.obtener);
direccionesRoutes.post('/', validate({ body: direccionBody }), c.crear);
direccionesRoutes.put('/:id', validate({ params: paramsId, body: direccionBody }), c.actualizar);
direccionesRoutes.delete('/:id', validate({ params: paramsId }), c.eliminar);
