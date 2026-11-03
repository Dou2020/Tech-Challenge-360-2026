import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { paramsId } from '../../shared/utils/esquemas.js';
import { tarjetasController as c } from './tarjetas.controller.js';
import { tarjetaBody } from './tarjetas.schemas.js';

/**
 * Montado en /api/tarjetas. Solo Cliente (401 sin token, 403 con otro rol); cada cliente ve
 * únicamente sus tarjetas y la de otro responde 404.
 */
export const tarjetasRoutes = Router();

tarjetasRoutes.use(authenticate, authorize('Cliente'));
tarjetasRoutes.get('/', c.listar);
tarjetasRoutes.post('/', validate({ body: tarjetaBody }), c.crear);
tarjetasRoutes.patch('/:id/predeterminada', validate({ params: paramsId }), c.marcarPredeterminada);
tarjetasRoutes.delete('/:id', validate({ params: paramsId }), c.eliminar);
