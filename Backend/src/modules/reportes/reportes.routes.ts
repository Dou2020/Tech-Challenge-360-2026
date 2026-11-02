import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { reportesController as c } from './reportes.controller.js';
import { carritosQuery, rangoQuery, topProductosQuery, ventasQuery } from './reportes.schemas.js';

/** Montado en /api/reportes. Solo Administrador y solo lectura. */
export const reportesRoutes = Router();

reportesRoutes.use(authenticate, authorize('Administrador'));
reportesRoutes.get('/stream', c.stream);
reportesRoutes.get('/resumen', validate({ query: rangoQuery }), c.resumen);
reportesRoutes.get('/ventas', validate({ query: ventasQuery }), c.ventas);
reportesRoutes.get('/ventas-por-categoria', validate({ query: rangoQuery }), c.ventasPorCategoria);
reportesRoutes.get(
  '/productos-mas-vendidos',
  validate({ query: topProductosQuery }),
  c.productosMasVendidos,
);
reportesRoutes.get(
  '/carritos-abandonados',
  validate({ query: carritosQuery }),
  c.carritosAbandonados,
);
