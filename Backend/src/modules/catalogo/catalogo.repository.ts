import sql from 'mssql';
import { executeSp, type ParametroSp, type ResultadoSp } from '../../db/executeSp.js';
import { parametrosPaginacion, type Paginacion } from '../../shared/utils/paginacion.js';
import type {
  DatosCategoria,
  DatosImagen,
  DatosProducto,
  FilaAtributo,
  FilaCategoria,
  FilaCategoriaPublica,
  FilaImagen,
  FilaMetodoEnvio,
  FilaProducto,
  FilaProductoCatalogo,
  FilaProductoListado,
  FilaProductoPublico,
  FilaValorAtributo,
  FilaValorCreado,
  FilaValorVariante,
  FilaVariante,
  FilaVariantePublica,
  FiltrosCatalogo,
  FiltrosCategorias,
  FiltrosProductos,
  ResultSetsProducto,
  ResultSetsProductoPublico,
  ResultSetsVariante,
} from './catalogo.types.js';

/*
 * Todos los SPs que escriben reciben @IDUsuarioSolicitante (del JWT) y, además de sus códigos,
 * pueden lanzar 50004 (solicitante inexistente) y 50012 (solicitante desactivado).
 * Los NULL de los filtros significan "sin filtro".
 */

const solicitante = (idUsuario: number): ParametroSp => ({
  nombre: 'IDUsuarioSolicitante',
  tipo: sql.Int,
  valor: idUsuario,
});

const idParam = (nombre: string, valor: number): ParametroSp => ({
  nombre,
  tipo: sql.Int,
  valor,
});

const bitOpcional = (nombre: string, valor: boolean | undefined): ParametroSp => ({
  nombre,
  tipo: sql.Bit,
  valor: valor ?? null,
});

function primeraFila<T>(resultado: ResultadoSp<T>, sp: string): T {
  const fila = resultado.filas[0];
  if (!fila) throw new Error(`${sp} no devolvió filas`);
  return fila;
}

/** PROD_DETALLE: producto, variantes, valores e imágenes, en ese orden. */
function aResultSetsProducto(resultado: ResultadoSp<FilaProducto>): ResultSetsProducto {
  return {
    producto: resultado.filas[0],
    variantes: (resultado.resultSets[1] ?? []) as FilaVariante[],
    valores: (resultado.resultSets[2] ?? []) as FilaValorVariante[],
    imagenes: (resultado.resultSets[3] ?? []) as FilaImagen[],
  };
}

/** VAR_DETALLE: variante y sus valores. */
function aResultSetsVariante(resultado: ResultadoSp<FilaVariante>): ResultSetsVariante {
  return {
    variante: resultado.filas[0],
    valores: (resultado.resultSets[1] ?? []) as FilaValorVariante[],
  };
}

/** Arreglo de IDValorAtributo como JSON (`[4,16]`); undefined → NULL. */
const valoresJson = (valores: number[] | undefined): ParametroSp => ({
  nombre: 'Valores',
  tipo: sql.NVarChar(sql.MAX),
  valor: valores === undefined ? null : JSON.stringify(valores),
});

export const catalogoRepository = {
  // --- Catálogo público (sin bitácora) ---------------------------------------

  async listarCategoriasPublicas(): Promise<FilaCategoriaPublica[]> {
    const { filas } = await executeSp<FilaCategoriaPublica>('SP_Catalogo_ListarCategorias');
    return filas;
  },

  /** Solo lo visible: producto activo, categoría activa y al menos una variante activa. */
  buscarProductos(
    filtros: FiltrosCatalogo,
    paginacion: Paginacion,
  ): Promise<ResultadoSp<FilaProductoCatalogo>> {
    return executeSp<FilaProductoCatalogo>('SP_Catalogo_BuscarProductos', [
      { nombre: 'Texto', tipo: sql.NVarChar(150), valor: filtros.q ?? null },
      { nombre: 'IDCategoria', tipo: sql.Int, valor: filtros.idCategoria ?? null },
      { nombre: 'PrecioMin', tipo: sql.Decimal(12, 2), valor: filtros.precioMin ?? null },
      { nombre: 'PrecioMax', tipo: sql.Decimal(12, 2), valor: filtros.precioMax ?? null },
      bitOpcional('Disponible', filtros.disponible),
      ...parametrosPaginacion(paginacion),
    ]);
  },

  /** 50004 si no existe o no es visible en la tienda. */
  async obtenerProductoPublico(idProducto: number): Promise<ResultSetsProductoPublico> {
    const resultado = await executeSp<FilaProductoPublico>('SP_Catalogo_ObtenerProducto', [
      idParam('IDProducto', idProducto),
    ]);
    return {
      producto: resultado.filas[0],
      variantes: (resultado.resultSets[1] ?? []) as FilaVariantePublica[],
      valores: (resultado.resultSets[2] ?? []) as FilaValorVariante[],
      imagenes: (resultado.resultSets[3] ?? []) as FilaImagen[],
    };
  },

  async listarMetodosEnvio(): Promise<FilaMetodoEnvio[]> {
    const { filas } = await executeSp<FilaMetodoEnvio>('SP_Checkout_ListarMetodosEnvio');
    return filas;
  },

  // --- Categorías -------------------------------------------------------------

  listarCategorias(
    filtros: FiltrosCategorias,
    paginacion: Paginacion,
  ): Promise<ResultadoSp<FilaCategoria>> {
    return executeSp<FilaCategoria>('SP_Categorias_Listar', [
      { nombre: 'Texto', tipo: sql.NVarChar(100), valor: filtros.q ?? null },
      bitOpcional('Activo', filtros.activo),
      ...parametrosPaginacion(paginacion),
    ]);
  },

  async obtenerCategoria(idCategoria: number): Promise<FilaCategoria> {
    const resultado = await executeSp<FilaCategoria>('SP_Categorias_ObtenerPorId', [
      idParam('IDCategoria', idCategoria),
    ]);
    return primeraFila(resultado, 'SP_Categorias_ObtenerPorId');
  },

  /** Nombre repetido: 2627 → DUPLICADO. */
  async crearCategoria(idUsuario: number, datos: DatosCategoria): Promise<FilaCategoria> {
    const resultado = await executeSp<FilaCategoria>('SP_Categorias_Crear', [
      solicitante(idUsuario),
      { nombre: 'Nombre', tipo: sql.NVarChar(100), valor: datos.nombre },
      { nombre: 'Descripcion', tipo: sql.NVarChar(500), valor: datos.descripcion },
    ]);
    return primeraFila(resultado, 'SP_Categorias_Crear');
  },

  async actualizarCategoria(
    idUsuario: number,
    idCategoria: number,
    datos: DatosCategoria,
  ): Promise<FilaCategoria> {
    const resultado = await executeSp<FilaCategoria>('SP_Categorias_Actualizar', [
      solicitante(idUsuario),
      idParam('IDCategoria', idCategoria),
      { nombre: 'Nombre', tipo: sql.NVarChar(100), valor: datos.nombre },
      { nombre: 'Descripcion', tipo: sql.NVarChar(500), valor: datos.descripcion },
    ]);
    return primeraFila(resultado, 'SP_Categorias_Actualizar');
  },

  async cambiarEstadoCategoria(
    idUsuario: number,
    idCategoria: number,
    activo: boolean,
  ): Promise<FilaCategoria> {
    const resultado = await executeSp<FilaCategoria>('SP_Categorias_CambiarEstado', [
      solicitante(idUsuario),
      idParam('IDCategoria', idCategoria),
      { nombre: 'Activo', tipo: sql.Bit, valor: activo },
    ]);
    return primeraFila(resultado, 'SP_Categorias_CambiarEstado');
  },

  /** 50051 EN_USO si tiene productos (aun inactivos) o cupones. */
  async eliminarCategoria(idUsuario: number, idCategoria: number): Promise<void> {
    await executeSp('SP_Categorias_Eliminar', [
      solicitante(idUsuario),
      idParam('IDCategoria', idCategoria),
    ]);
  },

  // --- Productos --------------------------------------------------------------

  listarProductos(
    filtros: FiltrosProductos,
    paginacion: Paginacion,
  ): Promise<ResultadoSp<FilaProductoListado>> {
    return executeSp<FilaProductoListado>('SP_Productos_Listar', [
      { nombre: 'Texto', tipo: sql.NVarChar(150), valor: filtros.q ?? null },
      { nombre: 'IDCategoria', tipo: sql.Int, valor: filtros.idCategoria ?? null },
      bitOpcional('Activo', filtros.activo),
      ...parametrosPaginacion(paginacion),
    ]);
  },

  async obtenerProducto(idProducto: number): Promise<ResultSetsProducto> {
    return aResultSetsProducto(
      await executeSp<FilaProducto>('SP_Productos_ObtenerPorId', [
        idParam('IDProducto', idProducto),
      ]),
    );
  },

  /**
   * Crea el producto y sus variantes en una transacción. `variantesJson` es el arreglo
   * `[{ sku, precio, existenciaInicial, valores }]` (claves exactas: el SP usa OPENJSON).
   */
  async crearProducto(
    idUsuario: number,
    datos: DatosProducto,
    variantesJson: string,
  ): Promise<ResultSetsProducto> {
    return aResultSetsProducto(
      await executeSp<FilaProducto>('SP_Productos_Crear', [
        solicitante(idUsuario),
        idParam('IDCategoria', datos.idCategoria),
        { nombre: 'Nombre', tipo: sql.NVarChar(150), valor: datos.nombre },
        { nombre: 'Descripcion', tipo: sql.NVarChar(sql.MAX), valor: datos.descripcion },
        { nombre: 'Variantes', tipo: sql.NVarChar(sql.MAX), valor: variantesJson },
      ]),
    );
  },

  async actualizarProducto(
    idUsuario: number,
    idProducto: number,
    datos: DatosProducto,
  ): Promise<ResultSetsProducto> {
    return aResultSetsProducto(
      await executeSp<FilaProducto>('SP_Productos_Actualizar', [
        solicitante(idUsuario),
        idParam('IDProducto', idProducto),
        idParam('IDCategoria', datos.idCategoria),
        { nombre: 'Nombre', tipo: sql.NVarChar(150), valor: datos.nombre },
        { nombre: 'Descripcion', tipo: sql.NVarChar(sql.MAX), valor: datos.descripcion },
      ]),
    );
  },

  async cambiarEstadoProducto(
    idUsuario: number,
    idProducto: number,
    activo: boolean,
  ): Promise<ResultSetsProducto> {
    return aResultSetsProducto(
      await executeSp<FilaProducto>('SP_Productos_CambiarEstado', [
        solicitante(idUsuario),
        idParam('IDProducto', idProducto),
        { nombre: 'Activo', tipo: sql.Bit, valor: activo },
      ]),
    );
  },

  /**
   * 50050 PRODUCTO_CON_VENTAS; 50051 EN_USO si tiene kardex o reservas.
   * Devuelve las Url de las imágenes que tenía (0..n) para borrar sus archivos.
   */
  async eliminarProducto(idUsuario: number, idProducto: number): Promise<string[]> {
    const { filas } = await executeSp<{ Url: string }>('SP_Productos_Eliminar', [
      solicitante(idUsuario),
      idParam('IDProducto', idProducto),
    ]);
    return filas.map((fila) => fila.Url);
  },

  async agregarImagen(
    idUsuario: number,
    idProducto: number,
    datos: DatosImagen,
  ): Promise<ResultSetsProducto> {
    return aResultSetsProducto(
      await executeSp<FilaProducto>('SP_Productos_AgregarImagen', [
        solicitante(idUsuario),
        idParam('IDProducto', idProducto),
        { nombre: 'Url', tipo: sql.NVarChar(500), valor: datos.url },
        { nombre: 'Orden', tipo: sql.Int, valor: datos.orden },
        { nombre: 'EsPrincipal', tipo: sql.Bit, valor: datos.esPrincipal },
      ]),
    );
  },

  /** 50004 también si la imagen es de otro producto. Devuelve la Url borrada. */
  async eliminarImagen(
    idUsuario: number,
    idProducto: number,
    idImagen: number,
  ): Promise<string | undefined> {
    const { filas } = await executeSp<{ Url: string }>('SP_Productos_EliminarImagen', [
      solicitante(idUsuario),
      idParam('IDProducto', idProducto),
      idParam('IDProductoImagen', idImagen),
    ]);
    return filas[0]?.Url;
  },

  // --- Variantes --------------------------------------------------------------

  async crearVariante(
    idUsuario: number,
    idProducto: number,
    datos: { sku: string; precio: number; existenciaInicial: number; valores: number[] },
  ): Promise<ResultSetsVariante> {
    return aResultSetsVariante(
      await executeSp<FilaVariante>('SP_Variantes_Crear', [
        solicitante(idUsuario),
        idParam('IDProducto', idProducto),
        { nombre: 'SKU', tipo: sql.NVarChar(50), valor: datos.sku },
        { nombre: 'Precio', tipo: sql.Decimal(12, 2), valor: datos.precio },
        { nombre: 'ExistenciaInicial', tipo: sql.Int, valor: datos.existenciaInicial },
        valoresJson(datos.valores),
      ]),
    );
  },

  /** `valores` undefined → NULL: conserva los valores actuales. */
  async actualizarVariante(
    idUsuario: number,
    idVariante: number,
    datos: { sku: string; valores?: number[] | undefined },
  ): Promise<ResultSetsVariante> {
    return aResultSetsVariante(
      await executeSp<FilaVariante>('SP_Variantes_Actualizar', [
        solicitante(idUsuario),
        idParam('IDVariante', idVariante),
        { nombre: 'SKU', tipo: sql.NVarChar(50), valor: datos.sku },
        valoresJson(datos.valores),
      ]),
    );
  },

  async cambiarPrecioVariante(
    idUsuario: number,
    idVariante: number,
    precio: number,
  ): Promise<ResultSetsVariante> {
    return aResultSetsVariante(
      await executeSp<FilaVariante>('SP_Variantes_CambiarPrecio', [
        solicitante(idUsuario),
        idParam('IDVariante', idVariante),
        { nombre: 'Precio', tipo: sql.Decimal(12, 2), valor: precio },
      ]),
    );
  },

  async cambiarEstadoVariante(
    idUsuario: number,
    idVariante: number,
    activo: boolean,
  ): Promise<ResultSetsVariante> {
    return aResultSetsVariante(
      await executeSp<FilaVariante>('SP_Variantes_CambiarEstado', [
        solicitante(idUsuario),
        idParam('IDVariante', idVariante),
        { nombre: 'Activo', tipo: sql.Bit, valor: activo },
      ]),
    );
  },

  // --- Atributos --------------------------------------------------------------

  async listarAtributos(): Promise<{ atributos: FilaAtributo[]; valores: FilaValorAtributo[] }> {
    const resultado = await executeSp<FilaAtributo>('SP_Atributos_Listar');
    return {
      atributos: resultado.filas,
      valores: (resultado.resultSets[1] ?? []) as FilaValorAtributo[],
    };
  },

  async crearAtributo(idUsuario: number, nombre: string): Promise<FilaAtributo> {
    const resultado = await executeSp<FilaAtributo>('SP_Atributos_Crear', [
      solicitante(idUsuario),
      { nombre: 'Nombre', tipo: sql.NVarChar(50), valor: nombre },
    ]);
    return primeraFila(resultado, 'SP_Atributos_Crear');
  },

  async agregarValorAtributo(
    idUsuario: number,
    idAtributo: number,
    valor: string,
  ): Promise<FilaValorCreado> {
    const resultado = await executeSp<FilaValorCreado>('SP_Atributos_AgregarValor', [
      solicitante(idUsuario),
      idParam('IDAtributo', idAtributo),
      { nombre: 'Valor', tipo: sql.NVarChar(50), valor },
    ]);
    return primeraFila(resultado, 'SP_Atributos_AgregarValor');
  },
};
