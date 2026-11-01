import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { limitarLogin, limitarRegistro } from '../../middlewares/rateLimit.js';
import { validate } from '../../middlewares/validate.js';
import { authController } from './auth.controller.js';
import { loginSchema, registroSchema } from './auth.schemas.js';

/** Montado en /api/auth. */
export const authRoutes = Router();

authRoutes.post(
  '/registro',
  limitarRegistro,
  validate({ body: registroSchema }),
  authController.registro,
);
authRoutes.post('/login', limitarLogin, validate({ body: loginSchema }), authController.login);
authRoutes.post('/refresh', authController.refresh);
authRoutes.post('/logout', authController.logout);
authRoutes.get('/me', authenticate, authController.me);
