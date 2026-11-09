import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, {
  Router,
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { imagenes } from './shared/almacenamiento/imagenes.js';
import { AppError } from './shared/errors/AppError.js';
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
import { checkoutRoutes } from './modules/checkout/checkout.routes.js';
import { cuponesRoutes } from './modules/cupones/cupones.routes.js';
import { direccionesRoutes } from './modules/direcciones/direcciones.routes.js';
import { tarjetasRoutes } from './modules/tarjetas/tarjetas.routes.js';
import { inventarioRoutes } from './modules/inventario/inventario.routes.js';
import { pedidosRoutes } from './modules/pedidos/pedidos.routes.js';
import { reportesRoutes } from './modules/reportes/reportes.routes.js';
import { bitacoraRoutes } from './modules/bitacora/bitacora.routes.js';
import { configuracionRoutes } from './modules/configuracion/configuracion.routes.js';
import { perfilRoutes } from './modules/perfil/perfil.routes.js';
import { usuariosRoutes } from './modules/usuarios/usuarios.routes.js';
import {
  sucursalesPublicasRoutes,
  sucursalesRoutes,
} from './modules/sucursales/sucursales.routes.js';
import { sistemaRoutes } from './modules/sistema/sistema.routes.js';

// Funciona igual desde src/ (tsx, vitest) y desde dist/ (la imagen copia src/docs/openapi.yaml).
const especificacionOpenApi = parse(
  readFileSync(new URL('../src/docs/openapi.yaml', import.meta.url), 'utf8'),
) as swaggerUi.JsonObject;

/** Cabeceras de las imágenes subidas: son datos, nunca se ejecutan ni se incrustan como página. */
const cabecerasImagen: RequestHandler = (_req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Son públicas: helmet las dejaría en same-origin y el frontend en otro origen no las vería.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
};

/** send (express.static) pasa un error http 416 cuando el Range cae fuera del archivo. */
const errorRangoImagen: ErrorRequestHandler = (error, _req, res, next) => {
  if ((error as { status?: unknown } | null)?.status === 416) {
    // send ya puso las cabeceras del archivo; res.json no pisa un Content-Type existente.
    // Content-Range (bytes */tamaño) se conserva: es lo que pide la RFC 9110 para un 416.
    res.removeHeader('Content-Type');
    res.removeHeader('Cache-Control');
    next(
      new AppError('RANGO_NO_SATISFACIBLE', 'El rango pedido queda fuera del tamaño del archivo.'),
    );
    return;
  }
  next(error);
};

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
  api.use('/catalogo', sucursalesPublicasRoutes);
  api.use('/metodos-envio', metodosEnvioRoutes);
  api.use('/sucursales', sucursalesRoutes);
  api.use('/categorias', categoriasRoutes);
  api.use('/productos', productosRoutes);
  api.use('/variantes', variantesRoutes);
  api.use('/atributos', atributosRoutes);
  api.use('/inventario', inventarioRoutes);
  api.use('/direcciones', direccionesRoutes);
  api.use('/tarjetas', tarjetasRoutes);
  api.use('/carrito', carritoRoutes);
  api.use('/cupones', cuponesRoutes);
  api.use('/checkout', checkoutRoutes);
  api.use('/pedidos', pedidosRoutes);
  api.use('/reportes', reportesRoutes);
  api.use('/perfil', perfilRoutes);
  api.use('/usuarios', usuariosRoutes);
  api.use('/bitacora', bitacoraRoutes);
  api.use('/configuracion', configuracionRoutes);
  // Imágenes de producto subidas al servidor. Un nombre que no existe cae al 404 JSON.
  api.use(
    '/imagenes',
    cabecerasImagen,
    express.static(imagenes.raiz(), {
      dotfiles: 'deny',
      index: false,
      redirect: false,
      fallthrough: true,
      maxAge: '365d',
      immutable: true,
    }),
    errorRangoImagen,
  );
  api.use('/docs', swaggerUi.serve, swaggerUi.setup(especificacionOpenApi));
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
