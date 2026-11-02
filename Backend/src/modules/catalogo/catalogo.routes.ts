import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { paramsId } from '../../shared/utils/esquemas.js';
import { catalogoController as c } from './catalogo.controller.js';
import {
  actualizarVarianteBody,
  atributoBody,
  buscarProductosQuery,
  categoriaBody,
  crearProductoBody,
  crearVarianteBody,
  estadoBody,
  imagenBody,
  listarCategoriasQuery,
  listarProductosQuery,
  paramsImagen,
  precioBody,
  productoBody,
  valorAtributoBody,
} from './catalogo.schemas.js';

/** Gestión del catálogo: solo Administrador (401 sin token, 403 con otro rol). */
const soloAdmin = [authenticate, authorize('Administrador')];

/** Montado en /api/catalogo. Público: solo lo activo. */
export const catalogoPublicoRoutes = Router();

catalogoPublicoRoutes.get('/categorias', c.categoriasPublicas);
catalogoPublicoRoutes.get(
  '/productos',
  validate({ query: buscarProductosQuery }),
  c.buscarProductos,
);
catalogoPublicoRoutes.get('/productos/:id', validate({ params: paramsId }), c.productoPublico);

/** Montado en /api/metodos-envio. Público. */
export const metodosEnvioRoutes = Router();

metodosEnvioRoutes.get('/', c.metodosEnvio);

/** Montado en /api/categorias. */
export const categoriasRoutes = Router();

categoriasRoutes.use(soloAdmin);
categoriasRoutes.get('/', validate({ query: listarCategoriasQuery }), c.listarCategorias);
categoriasRoutes.get('/:id', validate({ params: paramsId }), c.obtenerCategoria);
categoriasRoutes.post('/', validate({ body: categoriaBody }), c.crearCategoria);
categoriasRoutes.put(
  '/:id',
  validate({ params: paramsId, body: categoriaBody }),
  c.actualizarCategoria,
);
categoriasRoutes.patch(
  '/:id/estado',
  validate({ params: paramsId, body: estadoBody }),
  c.cambiarEstadoCategoria,
);
categoriasRoutes.delete('/:id', validate({ params: paramsId }), c.eliminarCategoria);

/** Montado en /api/productos. */
export const productosRoutes = Router();

productosRoutes.use(soloAdmin);
productosRoutes.get('/', validate({ query: listarProductosQuery }), c.listarProductos);
productosRoutes.get('/:id', validate({ params: paramsId }), c.obtenerProducto);
productosRoutes.post('/', validate({ body: crearProductoBody }), c.crearProducto);
productosRoutes.put(
  '/:id',
  validate({ params: paramsId, body: productoBody }),
  c.actualizarProducto,
);
productosRoutes.patch(
  '/:id/estado',
  validate({ params: paramsId, body: estadoBody }),
  c.cambiarEstadoProducto,
);
productosRoutes.delete('/:id', validate({ params: paramsId }), c.eliminarProducto);
productosRoutes.post(
  '/:id/imagenes',
  validate({ params: paramsId, body: imagenBody }),
  c.agregarImagen,
);
productosRoutes.delete(
  '/:id/imagenes/:idImagen',
  validate({ params: paramsImagen }),
  c.eliminarImagen,
);
productosRoutes.post(
  '/:id/variantes',
  validate({ params: paramsId, body: crearVarianteBody }),
  c.crearVariante,
);

/** Montado en /api/variantes. La existencia no se edita aquí: solo por inventario. */
export const variantesRoutes = Router();

variantesRoutes.use(soloAdmin);
variantesRoutes.put(
  '/:id',
  validate({ params: paramsId, body: actualizarVarianteBody }),
  c.actualizarVariante,
);
variantesRoutes.patch(
  '/:id/precio',
  validate({ params: paramsId, body: precioBody }),
  c.cambiarPrecioVariante,
);
variantesRoutes.patch(
  '/:id/estado',
  validate({ params: paramsId, body: estadoBody }),
  c.cambiarEstadoVariante,
);

/** Montado en /api/atributos. */
export const atributosRoutes = Router();

atributosRoutes.use(soloAdmin);
atributosRoutes.get('/', c.listarAtributos);
atributosRoutes.post('/', validate({ body: atributoBody }), c.crearAtributo);
atributosRoutes.post(
  '/:id/valores',
  validate({ params: paramsId, body: valorAtributoBody }),
  c.agregarValorAtributo,
);
