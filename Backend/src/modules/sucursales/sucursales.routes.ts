import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { paramsId } from '../../shared/utils/esquemas.js';
import { sucursalesController as c } from './sucursales.controller.js';
import { estadoSucursalBody, listarSucursalesQuery, sucursalBody } from './sucursales.schemas.js';

/**
 * Montado en /api/catalogo, junto al router del catálogo (Express sigue con el siguiente
 * router si una ruta no coincide). Público: solo sucursales activas.
 */
export const sucursalesPublicasRoutes = Router();

sucursalesPublicasRoutes.get('/sucursales', c.publicas);

/** Montado en /api/sucursales: solo Administrador (401 sin token, 403 con otro rol). */
export const sucursalesRoutes = Router();

sucursalesRoutes.use(authenticate, authorize('Administrador'));
sucursalesRoutes.get('/', validate({ query: listarSucursalesQuery }), c.listar);
sucursalesRoutes.get('/:id', validate({ params: paramsId }), c.obtener);
sucursalesRoutes.post('/', validate({ body: sucursalBody }), c.crear);
sucursalesRoutes.put('/:id', validate({ params: paramsId, body: sucursalBody }), c.actualizar);
sucursalesRoutes.patch(
  '/:id/estado',
  validate({ params: paramsId, body: estadoSucursalBody }),
  c.cambiarEstado,
);
sucursalesRoutes.delete('/:id', validate({ params: paramsId }), c.eliminar);
