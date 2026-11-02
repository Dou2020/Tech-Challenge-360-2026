import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { idempotencyKey } from '../../middlewares/idempotencyKey.js';
import { validate } from '../../middlewares/validate.js';
import { checkoutController as c } from './checkout.controller.js';
import { iniciarBody, pagarBody, resumenQuery } from './checkout.schemas.js';

/** Montado en /api/checkout. Solo Cliente (401 sin token, 403 con otro rol). */
export const checkoutRoutes = Router();

checkoutRoutes.use(authenticate, authorize('Cliente'));
checkoutRoutes.post('/iniciar', validate({ body: iniciarBody }), c.iniciar);
checkoutRoutes.get('/', validate({ query: resumenQuery }), c.obtenerResumen);
checkoutRoutes.delete('/reserva', c.liberarReserva);
// idempotencyKey antes de validate: sin header responde 400 IDEMPOTENCY_KEY_REQUERIDA.
checkoutRoutes.post('/pagar', idempotencyKey, validate({ body: pagarBody }), c.pagar);
