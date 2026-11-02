import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { imagenes } from '../../shared/almacenamiento/imagenes.js';
import { cache, type ResultadoCache } from '../../shared/cache/cache.js';
import { AppError } from '../../shared/errors/AppError.js';
import { aIso, aIsoOpcional } from '../../shared/utils/fechas.js';
import { aMonto, aMontoOpcional } from '../../shared/utils/montos.js';
import {
  respuestaPaginada,
  type Paginacion,
  type RespuestaPaginada,
} from '../../shared/utils/paginacion.js';
import { catalogoRepository } from './catalogo.repository.js';
import type {
  Atributo,
  AtributoCreado,
  Categoria,
  CategoriaPublica,
  DatosCategoria,
  DatosImagen,
  DatosProducto,
  DatosProductoNuevo,
  DatosVarianteActualizada,
  DatosVarianteNueva,
  FilaCategoria,
  FilaImagen,
  FilaProductoCatalogo,
  FilaProductoListado,
  FilaValorVariante,
  FilaVariante,
  FiltrosCatalogo,
  FiltrosCategorias,
  FiltrosProductos,
  Imagen,
  MetodoEnvio,
  Producto,
  ProductoCatalogo,
  ProductoListado,
  ProductoPublico,
  ResultSetsProducto,
  ResultSetsProductoPublico,
  ResultSetsVariante,
  ValorAtributoCreado,
  ValorVariante,
  Variante,
} from './catalogo.types.js';

/*
 * Caché (namespace `catalogo`, versionado): solo las categorías públicas y los métodos de envío.
 * La búsqueda y el detalle de productos NO se cachean porque traen existencia disponible
 * (`disponible`, `existenciaDisponible`), que nunca sale de Redis.
 *
 * Se invalida (INCR de la versión) después de que el SP confirmó, solo en las escrituras que
 * cambian lo cacheado: las categorías visibles y su `cantidadProductos` dependen de categorías,
 * productos (estado, categoría, alta y baja) y del estado y alta de variantes. Precios, SKU,
 * valores de atributo e imágenes no aparecen en lo cacheado.
 *
 * Actualizar una categoría o un producto también invalida `reportes`: VW_Reportes_VentasNetas une
 * el nombre y la categoría actuales, así que renombrar o mover un producto cambia
 * `ventas-por-categoria` y `productos-mas-vendidos`. Eliminar no lo invalida: los SP bloquean la
 * baja de un producto con ventas y de una categoría con productos, así que no hay ventas que cambiar.
 */
export const CLAVES_CACHE_CATALOGO = {
  categorias: 'categorias',
  metodosEnvio: 'metodos-envio',
} as const;

const invalidarCatalogo = () => cache.invalidar('catalogo');

/** Siempre, sin comparar campos: son escrituras raras de un administrador. */
const invalidarReportes = () => cache.invalidar('reportes');

/** Borra los archivos de imágenes propias (las URL externas se ignoran). Un fallo solo se registra. */
async function borrarArchivos(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      await imagenes.borrar(url);
    } catch (error) {
      logger.error({ err: error, url }, 'No se pudo borrar el archivo de la imagen');
    }
  }
}

// ---------------------------------------------------------------------------
// Mapeos fila → DTO
// ---------------------------------------------------------------------------

function aValor(fila: FilaValorVariante): ValorVariante {
  return {
    idAtributo: fila.IDAtributo,
    atributo: fila.Atributo,
    idValorAtributo: fila.IDValorAtributo,
    valor: fila.Valor,
  };
}

/** Agrupa los valores de atributo por IDVariante, en el orden en que llegan. */
function valoresPorVariante(valores: FilaValorVariante[]): Map<number, ValorVariante[]> {
  const mapa = new Map<number, ValorVariante[]>();
  for (const fila of valores) {
    const lista = mapa.get(fila.IDVariante);
    if (lista) lista.push(aValor(fila));
    else mapa.set(fila.IDVariante, [aValor(fila)]);
  }
  return mapa;
}

function aImagen(fila: FilaImagen): Imagen {
  return {
    idProductoImagen: fila.IDProductoImagen,
    url: fila.Url,
    orden: fila.Orden,
    esPrincipal: Boolean(fila.EsPrincipal),
  };
}

function aVariante(fila: FilaVariante, valores: ValorVariante[]): Variante {
  return {
    idVariante: fila.IDVariante,
    idProducto: fila.IDProducto,
    sku: fila.SKU,
    precio: aMonto(fila.Precio),
    existenciaFisica: fila.ExistenciaFisica,
    existenciaReservada: fila.ExistenciaReservada,
    existenciaDisponible: fila.ExistenciaDisponible,
    activo: Boolean(fila.Activo),
    descripcion: fila.Descripcion,
    valores,
  };
}

function aCategoria(fila: FilaCategoria): Categoria {
  return {
    idCategoria: fila.IDCategoria,
    nombre: fila.Nombre,
    descripcion: fila.Descripcion,
    activo: Boolean(fila.Activo),
    cantidadProductos: fila.CantidadProductos,
    cantidadCupones: fila.CantidadCupones,
  };
}

function aProductoCatalogo(fila: FilaProductoCatalogo): ProductoCatalogo {
  return {
    idProducto: fila.IDProducto,
    nombre: fila.Nombre,
    descripcion: fila.Descripcion,
    idCategoria: fila.IDCategoria,
    categoria: fila.Categoria,
    precioMinimo: aMonto(fila.PrecioMinimo),
    precioMaximo: aMonto(fila.PrecioMaximo),
    disponible: Boolean(fila.Disponible),
    imagenPrincipal: fila.ImagenPrincipal,
    fechaCreacion: aIso(fila.FechaCreacion),
  };
}

function aProductoListado(fila: FilaProductoListado): ProductoListado {
  return {
    idProducto: fila.IDProducto,
    nombre: fila.Nombre,
    idCategoria: fila.IDCategoria,
    categoria: fila.Categoria,
    activo: Boolean(fila.Activo),
    cantidadVariantes: fila.CantidadVariantes,
    cantidadVariantesActivas: fila.CantidadVariantesActivas,
    precioMinimo: aMontoOpcional(fila.PrecioMinimo),
    precioMaximo: aMontoOpcional(fila.PrecioMaximo),
    existenciaFisica: fila.ExistenciaFisica,
    existenciaReservada: fila.ExistenciaReservada,
    existenciaDisponible: fila.ExistenciaDisponible,
    imagenPrincipal: fila.ImagenPrincipal,
    fechaCreacion: aIso(fila.FechaCreacion),
    fechaModificacion: aIsoOpcional(fila.FechaModificacion),
  };
}

/** Detalle de gestión (PROD_DETALLE): producto + variantes con sus valores + imágenes. */
export function ensamblarProducto(resultSets: ResultSetsProducto): Producto {
  const { producto, variantes, valores, imagenes } = resultSets;
  if (!producto) throw new Error('El SP no devolvió el producto');
  const porVariante = valoresPorVariante(valores);
  return {
    idProducto: producto.IDProducto,
    nombre: producto.Nombre,
    descripcion: producto.Descripcion,
    idCategoria: producto.IDCategoria,
    categoria: producto.Categoria,
    categoriaActiva: Boolean(producto.CategoriaActiva),
    activo: Boolean(producto.Activo),
    fechaCreacion: aIso(producto.FechaCreacion),
    fechaModificacion: aIsoOpcional(producto.FechaModificacion),
    tieneVentas: Boolean(producto.TieneVentas),
    puedeEliminarse: Boolean(producto.PuedeEliminarse),
    variantes: variantes.map((fila) => aVariante(fila, porVariante.get(fila.IDVariante) ?? [])),
    imagenes: imagenes.map(aImagen),
  };
}

/** Detalle público: solo variantes activas, con existencia disponible y sin datos internos. */
export function ensamblarProductoPublico(resultSets: ResultSetsProductoPublico): ProductoPublico {
  const { producto, variantes, valores, imagenes } = resultSets;
  if (!producto) throw new AppError('NO_ENCONTRADO', 'El producto no existe.');
  const porVariante = valoresPorVariante(valores);
  return {
    idProducto: producto.IDProducto,
    nombre: producto.Nombre,
    descripcion: producto.Descripcion,
    idCategoria: producto.IDCategoria,
    categoria: producto.Categoria,
    precioMinimo: aMonto(producto.PrecioMinimo),
    precioMaximo: aMonto(producto.PrecioMaximo),
    disponible: Boolean(producto.Disponible),
    fechaCreacion: aIso(producto.FechaCreacion),
    imagenes: imagenes.map(aImagen),
    variantes: variantes.map((fila) => ({
      idVariante: fila.IDVariante,
      sku: fila.SKU,
      precio: aMonto(fila.Precio),
      existenciaDisponible: fila.ExistenciaDisponible,
      descripcion: fila.Descripcion,
      valores: porVariante.get(fila.IDVariante) ?? [],
    })),
  };
}

/** VAR_DETALLE: variante con sus valores. */
export function ensamblarVariante({ variante, valores }: ResultSetsVariante): Variante {
  if (!variante) throw new Error('El SP no devolvió la variante');
  return aVariante(variante, valores.map(aValor));
}

/**
 * JSON de @Variantes para SP_Productos_Crear. Las claves deben ser exactamente `sku`, `precio`,
 * `existenciaInicial` y `valores` (OPENJSON distingue mayúsculas). El precio viaja como texto
 * con 2 decimales para no arrastrar la representación binaria de un number.
 */
export function armarVariantesJson(variantes: DatosVarianteNueva[]): string {
  return JSON.stringify(
    variantes.map(({ sku, precio, existenciaInicial, valores }) => ({
      sku,
      precio: aMonto(precio),
      existenciaInicial,
      valores,
    })),
  );
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

export const catalogoService = {
  // --- Catálogo público -------------------------------------------------------

  async listarCategoriasPublicas(): Promise<ResultadoCache<CategoriaPublica[]>> {
    const clave = await cache.claveVersionada('catalogo', CLAVES_CACHE_CATALOGO.categorias);
    return cache.getOrSet(clave, env.CACHE_TTL_CATALOGO_SEG, async () =>
      (await catalogoRepository.listarCategoriasPublicas()).map((fila) => ({
        idCategoria: fila.IDCategoria,
        nombre: fila.Nombre,
        descripcion: fila.Descripcion,
        cantidadProductos: fila.CantidadProductos,
      })),
    );
  },

  async listarMetodosEnvio(): Promise<ResultadoCache<MetodoEnvio[]>> {
    const clave = await cache.claveVersionada('catalogo', CLAVES_CACHE_CATALOGO.metodosEnvio);
    return cache.getOrSet(clave, env.CACHE_TTL_CATALOGO_SEG, async () =>
      (await catalogoRepository.listarMetodosEnvio()).map((fila) => ({
        idMetodoEnvio: fila.IDMetodoEnvio,
        nombre: fila.Nombre,
        costo: aMonto(fila.Costo),
        diasEstimados: fila.DiasEstimados,
      })),
    );
  },

  /** Sin caché: `disponible` depende de la existencia. */
  async buscarProductos(
    filtros: FiltrosCatalogo,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<ProductoCatalogo>> {
    const resultado = await catalogoRepository.buscarProductos(filtros, paginacion);
    return respuestaPaginada(resultado, paginacion, aProductoCatalogo);
  },

  /** Sin caché: trae `existenciaDisponible` por variante. */
  async obtenerProductoPublico(idProducto: number): Promise<ProductoPublico> {
    return ensamblarProductoPublico(await catalogoRepository.obtenerProductoPublico(idProducto));
  },

  // --- Categorías -------------------------------------------------------------

  async listarCategorias(
    filtros: FiltrosCategorias,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<Categoria>> {
    const resultado = await catalogoRepository.listarCategorias(filtros, paginacion);
    return respuestaPaginada(resultado, paginacion, aCategoria);
  },

  async obtenerCategoria(idCategoria: number): Promise<Categoria> {
    return aCategoria(await catalogoRepository.obtenerCategoria(idCategoria));
  },

  async crearCategoria(idUsuario: number, datos: DatosCategoria): Promise<Categoria> {
    const categoria = aCategoria(await catalogoRepository.crearCategoria(idUsuario, datos));
    await invalidarCatalogo();
    return categoria;
  },

  async actualizarCategoria(
    idUsuario: number,
    idCategoria: number,
    datos: DatosCategoria,
  ): Promise<Categoria> {
    const categoria = aCategoria(
      await catalogoRepository.actualizarCategoria(idUsuario, idCategoria, datos),
    );
    await invalidarCatalogo();
    await invalidarReportes();
    return categoria;
  },

  async cambiarEstadoCategoria(
    idUsuario: number,
    idCategoria: number,
    activo: boolean,
  ): Promise<Categoria> {
    const categoria = aCategoria(
      await catalogoRepository.cambiarEstadoCategoria(idUsuario, idCategoria, activo),
    );
    await invalidarCatalogo();
    return categoria;
  },

  async eliminarCategoria(idUsuario: number, idCategoria: number): Promise<void> {
    await catalogoRepository.eliminarCategoria(idUsuario, idCategoria);
    await invalidarCatalogo();
  },

  // --- Productos --------------------------------------------------------------

  async listarProductos(
    filtros: FiltrosProductos,
    paginacion: Paginacion,
  ): Promise<RespuestaPaginada<ProductoListado>> {
    const resultado = await catalogoRepository.listarProductos(filtros, paginacion);
    return respuestaPaginada(resultado, paginacion, aProductoListado);
  },

  async obtenerProducto(idProducto: number): Promise<Producto> {
    return ensamblarProducto(await catalogoRepository.obtenerProducto(idProducto));
  },

  async crearProducto(idUsuario: number, datos: DatosProductoNuevo): Promise<Producto> {
    const { variantes, ...producto } = datos;
    const creado = ensamblarProducto(
      await catalogoRepository.crearProducto(idUsuario, producto, armarVariantesJson(variantes)),
    );
    await invalidarCatalogo();
    return creado;
  },

  async actualizarProducto(
    idUsuario: number,
    idProducto: number,
    datos: DatosProducto,
  ): Promise<Producto> {
    const producto = ensamblarProducto(
      await catalogoRepository.actualizarProducto(idUsuario, idProducto, datos),
    );
    await invalidarCatalogo();
    await invalidarReportes();
    return producto;
  },

  async cambiarEstadoProducto(
    idUsuario: number,
    idProducto: number,
    activo: boolean,
  ): Promise<Producto> {
    const producto = ensamblarProducto(
      await catalogoRepository.cambiarEstadoProducto(idUsuario, idProducto, activo),
    );
    await invalidarCatalogo();
    return producto;
  },

  async eliminarProducto(idUsuario: number, idProducto: number): Promise<void> {
    const urls = await catalogoRepository.eliminarProducto(idUsuario, idProducto);
    await invalidarCatalogo();
    await borrarArchivos(urls);
  },

  /** Las imágenes no están en lo cacheado: no invalida. */
  async agregarImagen(
    idUsuario: number,
    idProducto: number,
    datos: DatosImagen,
  ): Promise<Producto> {
    return ensamblarProducto(await catalogoRepository.agregarImagen(idUsuario, idProducto, datos));
  },

  /**
   * Guarda el archivo en disco y registra su URL. Si el SP rechaza (producto inexistente, tope de
   * imágenes…) borra el archivo: no quedan huérfanos. 415 si los bytes no son JPEG, PNG ni WebP.
   */
  async subirImagen(
    idUsuario: number,
    idProducto: number,
    archivo: Buffer,
    datos: Omit<DatosImagen, 'url'>,
  ): Promise<Producto> {
    const url = await imagenes.guardar(archivo);
    if (!url) {
      throw new AppError(
        'TIPO_ARCHIVO_NO_PERMITIDO',
        'El archivo no es una imagen JPEG, PNG o WebP.',
        [{ field: 'imagen', message: 'Formatos permitidos: JPEG, PNG y WebP.' }],
      );
    }
    try {
      return await catalogoService.agregarImagen(idUsuario, idProducto, { ...datos, url });
    } catch (error) {
      await borrarArchivos([url]);
      throw error;
    }
  },

  /** Borra el archivo después de que el SP confirmó (best effort). */
  async eliminarImagen(idUsuario: number, idProducto: number, idImagen: number): Promise<void> {
    const url = await catalogoRepository.eliminarImagen(idUsuario, idProducto, idImagen);
    if (url) await borrarArchivos([url]);
  },

  // --- Variantes --------------------------------------------------------------

  /** Una variante activa nueva puede hacer visible su producto: invalida. */
  async crearVariante(
    idUsuario: number,
    idProducto: number,
    datos: DatosVarianteNueva,
  ): Promise<Variante> {
    const variante = ensamblarVariante(
      await catalogoRepository.crearVariante(idUsuario, idProducto, datos),
    );
    await invalidarCatalogo();
    return variante;
  },

  /** SKU y valores no están en lo cacheado: no invalida. */
  async actualizarVariante(
    idUsuario: number,
    idVariante: number,
    datos: DatosVarianteActualizada,
  ): Promise<Variante> {
    return ensamblarVariante(
      await catalogoRepository.actualizarVariante(idUsuario, idVariante, datos),
    );
  },

  /** El precio no está en lo cacheado (la búsqueda y el detalle se leen siempre de la base). */
  async cambiarPrecioVariante(
    idUsuario: number,
    idVariante: number,
    precio: number,
  ): Promise<Variante> {
    return ensamblarVariante(
      await catalogoRepository.cambiarPrecioVariante(idUsuario, idVariante, precio),
    );
  },

  /** Desactivar la última variante activa oculta el producto: invalida. */
  async cambiarEstadoVariante(
    idUsuario: number,
    idVariante: number,
    activo: boolean,
  ): Promise<Variante> {
    const variante = ensamblarVariante(
      await catalogoRepository.cambiarEstadoVariante(idUsuario, idVariante, activo),
    );
    await invalidarCatalogo();
    return variante;
  },

  // --- Atributos --------------------------------------------------------------

  async listarAtributos(): Promise<Atributo[]> {
    const { atributos, valores } = await catalogoRepository.listarAtributos();
    return atributos.map((atributo) => ({
      idAtributo: atributo.IDAtributo,
      nombre: atributo.Nombre,
      cantidadValores: atributo.CantidadValores ?? 0,
      valores: valores
        .filter((valor) => valor.IDAtributo === atributo.IDAtributo)
        .map((valor) => ({
          idValorAtributo: valor.IDValorAtributo,
          valor: valor.Valor,
          cantidadVariantes: valor.CantidadVariantes,
        })),
    }));
  },

  async crearAtributo(idUsuario: number, nombre: string): Promise<AtributoCreado> {
    const fila = await catalogoRepository.crearAtributo(idUsuario, nombre);
    return { idAtributo: fila.IDAtributo, nombre: fila.Nombre };
  },

  async agregarValorAtributo(
    idUsuario: number,
    idAtributo: number,
    valor: string,
  ): Promise<ValorAtributoCreado> {
    const fila = await catalogoRepository.agregarValorAtributo(idUsuario, idAtributo, valor);
    return {
      idValorAtributo: fila.IDValorAtributo,
      idAtributo: fila.IDAtributo,
      atributo: fila.Atributo,
      valor: fila.Valor,
    };
  },
};
