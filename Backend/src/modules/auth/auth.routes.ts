import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import {
  limitarEstablecerContrasena,
  limitarLogin,
  limitarOlvido,
  limitarRegistro,
  limitarVerificarToken,
} from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import { authController } from './auth.controller.js';
import {
  establecerContrasenaSchema,
  loginSchema,
  olvidoSchema,
  registroSchema,
  verificarTokenSchema,
} from './auth.schemas.js';

/** Montado en /api/auth. */
export const authRoutes = Router();

authRoutes.post(
  '/registro',
  limitarRegistro,
  validate({ body: registroSchema }),
  authController.registro,
);
authRoutes.post('/login', limitarLogin, validate({ body: loginSchema }), authController.login);
authRoutes.post(
  '/contrasena/olvido',
  limitarOlvido,
  validate({ body: olvidoSchema }),
  authController.olvido,
);
authRoutes.post(
  '/contrasena/verificar',
  limitarVerificarToken,
  validate({ body: verificarTokenSchema }),
  authController.verificarToken,
);
authRoutes.post(
  '/contrasena/establecer',
  limitarEstablecerContrasena,
  validate({ body: establecerContrasenaSchema }),
  authController.establecerContrasena,
);
authRoutes.post('/refresh', authController.refresh);
authRoutes.post('/logout', authController.logout);
authRoutes.get('/me', authenticate, authController.me);
