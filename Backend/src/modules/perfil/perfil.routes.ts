import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { perfilController as c } from './perfil.controller.js';
import { cambioContrasenaBody, perfilBody } from './perfil.schemas.js';

/** Montado en /api/perfil. Cualquier rol autenticado; el usuario sale del token. */
export const perfilRoutes = Router();

perfilRoutes.use(authenticate);
perfilRoutes.get('/', c.obtener);
perfilRoutes.put('/', validate({ body: perfilBody }), c.actualizar);
perfilRoutes.put('/contrasena', validate({ body: cambioContrasenaBody }), c.cambiarContrasena);
