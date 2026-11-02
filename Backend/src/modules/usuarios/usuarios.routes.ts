import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { usuariosController as c } from './usuarios.controller.js';
import {
  actualizarUsuarioBody,
  crearUsuarioBody,
  estadoUsuarioBody,
  listarUsuariosQuery,
  paramsUsuario,
} from './usuarios.schemas.js';

/** Montado en /api/usuarios. Solo Administrador (401 sin token, 403 con otro rol). */
export const usuariosRoutes = Router();

usuariosRoutes.use(authenticate, authorize('Administrador'));
usuariosRoutes.get('/', validate({ query: listarUsuariosQuery }), c.listar);
usuariosRoutes.get('/:id', validate({ params: paramsUsuario }), c.obtener);
usuariosRoutes.post('/', validate({ body: crearUsuarioBody }), c.crear);
usuariosRoutes.put(
  '/:id',
  validate({ params: paramsUsuario, body: actualizarUsuarioBody }),
  c.actualizar,
);
usuariosRoutes.patch(
  '/:id/estado',
  validate({ params: paramsUsuario, body: estadoUsuarioBody }),
  c.cambiarEstado,
);
