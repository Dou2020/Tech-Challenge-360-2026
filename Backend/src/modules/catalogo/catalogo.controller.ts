import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import type { ResultadoCache } from '../../shared/cache/cache.js';
import type {
  ActualizarVarianteBody,
  AtributoBody,
  BuscarProductosQuery,
  CategoriaBody,
  CrearProductoBody,
  CrearVarianteBody,
  EstadoBody,
  ImagenArchivoBody,
  ImagenBody,
  OrdenImagenesBody,
  ListarCategoriasQuery,
  ListarProductosQuery,
  ParamsImagen,
  PrecioBody,
  ProductoBody,
  ValorAtributoBody,
} from './catalogo.schemas.js';
import { catalogoService } from './catalogo.service.js';

interface ParamsId {
  id: number;
}

/** Valores validados por `validate` (con coerciones y defaults). */
function validado<T>(res: Response): T {
  return res.locals.validado as T;
}

/** Id del Administrador que hace la petición (del JWT; `authenticate` ya lo exigió). */
function idSolicitante(req: Request): number {
  return req.usuario!.idUsuario;
}

function responderCache<T>(res: Response, { valor, hit }: ResultadoCache<T>): void {
  res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
  res.json(valor);
}

export const catalogoController = {
  // --- Catálogo público -------------------------------------------------------

  categoriasPublicas: (async (_req, res) => {
    responderCache(res, await catalogoService.listarCategoriasPublicas());
  }) satisfies RequestHandler,

  metodosEnvio: (async (_req, res) => {
    responderCache(res, await catalogoService.listarMetodosEnvio());
  }) satisfies RequestHandler,

  buscarProductos: (async (_req, res) => {
    const { query } = validado<{ query: BuscarProductosQuery }>(res);
    const { page, pageSize, sort, ...filtros } = query;
    res.json(await catalogoService.buscarProductos(filtros, { page, pageSize, sort }));
  }) satisfies RequestHandler,

  productoPublico: (async (_req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    res.json(await catalogoService.obtenerProductoPublico(params.id));
  }) satisfies RequestHandler,

  // --- Categorías -------------------------------------------------------------

  listarCategorias: (async (_req, res) => {
    const { query } = validado<{ query: ListarCategoriasQuery }>(res);
    const { page, pageSize, sort, ...filtros } = query;
    res.json(await catalogoService.listarCategorias(filtros, { page, pageSize, sort }));
  }) satisfies RequestHandler,

  obtenerCategoria: (async (_req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    res.json(await catalogoService.obtenerCategoria(params.id));
  }) satisfies RequestHandler,

  crearCategoria: (async (req, res) => {
    const { body } = validado<{ body: CategoriaBody }>(res);
    res.status(201).json(await catalogoService.crearCategoria(idSolicitante(req), body));
  }) satisfies RequestHandler,

  actualizarCategoria: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: CategoriaBody }>(res);
    res.json(await catalogoService.actualizarCategoria(idSolicitante(req), params.id, body));
  }) satisfies RequestHandler,

  cambiarEstadoCategoria: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: EstadoBody }>(res);
    res.json(
      await catalogoService.cambiarEstadoCategoria(idSolicitante(req), params.id, body.activo),
    );
  }) satisfies RequestHandler,

  eliminarCategoria: (async (req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    await catalogoService.eliminarCategoria(idSolicitante(req), params.id);
    res.status(204).end();
  }) satisfies RequestHandler,

  // --- Productos --------------------------------------------------------------

  listarProductos: (async (_req, res) => {
    const { query } = validado<{ query: ListarProductosQuery }>(res);
    const { page, pageSize, sort, ...filtros } = query;
    res.json(await catalogoService.listarProductos(filtros, { page, pageSize, sort }));
  }) satisfies RequestHandler,

  obtenerProducto: (async (_req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    res.json(await catalogoService.obtenerProducto(params.id));
  }) satisfies RequestHandler,

  crearProducto: (async (req, res) => {
    const { body } = validado<{ body: CrearProductoBody }>(res);
    res.status(201).json(await catalogoService.crearProducto(idSolicitante(req), body));
  }) satisfies RequestHandler,

  actualizarProducto: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: ProductoBody }>(res);
    res.json(await catalogoService.actualizarProducto(idSolicitante(req), params.id, body));
  }) satisfies RequestHandler,

  cambiarEstadoProducto: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: EstadoBody }>(res);
    res.json(
      await catalogoService.cambiarEstadoProducto(idSolicitante(req), params.id, body.activo),
    );
  }) satisfies RequestHandler,

  eliminarProducto: (async (req, res) => {
    const { params } = validado<{ params: ParamsId }>(res);
    await catalogoService.eliminarProducto(idSolicitante(req), params.id);
    res.status(204).end();
  }) satisfies RequestHandler,

  agregarImagen: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: ImagenBody }>(res);
    res.status(201).json(await catalogoService.agregarImagen(idSolicitante(req), params.id, body));
  }) satisfies RequestHandler,

  subirImagen: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: ImagenArchivoBody }>(res);
    if (!req.file) {
      throw new AppError('VALIDACION', 'Falta el archivo de la imagen.', [
        { field: 'imagen', message: 'Envía la imagen en el campo "imagen" (multipart/form-data).' },
      ]);
    }
    res
      .status(201)
      .json(
        await catalogoService.subirImagen(idSolicitante(req), params.id, req.file.buffer, body),
      );
  }) satisfies RequestHandler,

  ordenarImagenes: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: OrdenImagenesBody }>(res);
    res.json(await catalogoService.ordenarImagenes(idSolicitante(req), params.id, body.imagenes));
  }) satisfies RequestHandler,

  eliminarImagen: (async (req, res) => {
    const { params } = validado<{ params: ParamsImagen }>(res);
    await catalogoService.eliminarImagen(idSolicitante(req), params.id, params.idImagen);
    res.status(204).end();
  }) satisfies RequestHandler,

  crearVariante: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: CrearVarianteBody }>(res);
    res.status(201).json(await catalogoService.crearVariante(idSolicitante(req), params.id, body));
  }) satisfies RequestHandler,

  // --- Variantes --------------------------------------------------------------

  actualizarVariante: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: ActualizarVarianteBody }>(res);
    res.json(await catalogoService.actualizarVariante(idSolicitante(req), params.id, body));
  }) satisfies RequestHandler,

  cambiarPrecioVariante: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: PrecioBody }>(res);
    res.json(
      await catalogoService.cambiarPrecioVariante(idSolicitante(req), params.id, body.precio),
    );
  }) satisfies RequestHandler,

  cambiarEstadoVariante: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: EstadoBody }>(res);
    res.json(
      await catalogoService.cambiarEstadoVariante(idSolicitante(req), params.id, body.activo),
    );
  }) satisfies RequestHandler,

  // --- Atributos --------------------------------------------------------------

  listarAtributos: (async (_req, res) => {
    res.json(await catalogoService.listarAtributos());
  }) satisfies RequestHandler,

  crearAtributo: (async (req, res) => {
    const { body } = validado<{ body: AtributoBody }>(res);
    res.status(201).json(await catalogoService.crearAtributo(idSolicitante(req), body.nombre));
  }) satisfies RequestHandler,

  agregarValorAtributo: (async (req, res) => {
    const { params, body } = validado<{ params: ParamsId; body: ValorAtributoBody }>(res);
    res
      .status(201)
      .json(await catalogoService.agregarValorAtributo(idSolicitante(req), params.id, body.valor));
  }) satisfies RequestHandler,
};
