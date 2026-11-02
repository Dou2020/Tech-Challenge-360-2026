import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import {
  atributosRoutes,
  catalogoPublicoRoutes,
  categoriasRoutes,
  metodosEnvioRoutes,
  productosRoutes,
  variantesRoutes,
} from './modules/catalogo/catalogo.routes.js';
import { carritoRoutes } from './modules/carrito/carrito.routes.js';
import { cuponesRoutes } from './modules/cupones/cupones.routes.js';
import { direccionesRoutes } from './modules/direcciones/direcciones.routes.js';
import { inventarioRoutes } from './modules/inventario/inventario.routes.js';
import { sistemaRoutes } from './modules/sistema/sistema.routes.js';

// Funciona igual desde src/ (tsx, vitest) y desde dist/ (la imagen copia src/docs/openapi.yaml).
const especificacionOpenApi = parse(
  readFileSync(new URL('../src/docs/openapi.yaml', import.meta.url), 'utf8'),
) as swaggerUi.JsonObject;

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // detrás de nginx en docker compose

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const recibido = req.headers['x-request-id'];
        const id = typeof recibido === 'string' && recibido.length <= 100 ? recibido : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  const api = Router();
  api.use(sistemaRoutes);
  api.use('/auth', authRoutes);
  api.use('/catalogo', catalogoPublicoRoutes);
  api.use('/metodos-envio', metodosEnvioRoutes);
  api.use('/categorias', categoriasRoutes);
  api.use('/productos', productosRoutes);
  api.use('/variantes', variantesRoutes);
  api.use('/atributos', atributosRoutes);
  api.use('/inventario', inventarioRoutes);
  api.use('/direcciones', direccionesRoutes);
  api.use('/carrito', carritoRoutes);
  api.use('/cupones', cuponesRoutes);
  api.use('/docs', swaggerUi.serve, swaggerUi.setup(especificacionOpenApi));
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
