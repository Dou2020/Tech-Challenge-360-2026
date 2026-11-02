import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { inventarioController as c } from './inventario.controller.js';
import {
  ajusteBody,
  entradaBody,
  kardexQuery,
  listarExistenciasQuery,
  paramsVariante,
} from './inventario.schemas.js';

/**
 * Montado en /api/inventario. Operador y Administrador (401 sin token, 403 con otro rol).
 * La existencia solo cambia por movimientos de kardex: no hay PUT de existencias.
 */
export const inventarioRoutes = Router();

inventarioRoutes.use(authenticate, authorize('Operador', 'Administrador'));
inventarioRoutes.get('/tipos-movimiento', c.tiposMovimiento);
inventarioRoutes.get('/existencias', validate({ query: listarExistenciasQuery }), c.existencias);
inventarioRoutes.get(
  '/variantes/:idVariante/kardex',
  validate({ params: paramsVariante, query: kardexQuery }),
  c.kardex,
);
inventarioRoutes.post('/entradas', validate({ body: entradaBody }), c.registrarEntrada);
inventarioRoutes.post('/ajustes', validate({ body: ajusteBody }), c.registrarAjuste);
