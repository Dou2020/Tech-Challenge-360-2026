import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { bitacoraController as c } from './bitacora.controller.js';
import { listarBitacoraQuery } from './bitacora.schemas.js';

/**
 * Montado en /api/bitacora. Solo Administrador y solo lectura: no hay POST, PUT, PATCH ni
 * DELETE (responden 404). La bitácora la escriben los SPs en la transacción del cambio.
 */
export const bitacoraRoutes = Router();

bitacoraRoutes.use(authenticate, authorize('Administrador'));
bitacoraRoutes.get('/', validate({ query: listarBitacoraQuery }), c.listar);
bitacoraRoutes.get('/modulos', c.modulos);
