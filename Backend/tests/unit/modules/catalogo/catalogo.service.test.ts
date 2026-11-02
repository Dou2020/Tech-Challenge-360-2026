import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../../../src/config/env.js';
import { catalogoRepository } from '../../../../src/modules/catalogo/catalogo.repository.js';
import {
  armarVariantesJson,
  catalogoService,
  ensamblarProducto,
} from '../../../../src/modules/catalogo/catalogo.service.js';
import type {
  FilaCategoria,
  FilaProducto,
  FilaValorVariante,
  FilaVariante,
  ResultSetsProducto,
} from '../../../../src/modules/catalogo/catalogo.types.js';
import { imagenes } from '../../../../src/shared/almacenamiento/imagenes.js';
import { cache } from '../../../../src/shared/cache/cache.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';

vi.mock('../../../../src/modules/catalogo/catalogo.repository.js', () => ({
  catalogoRepository: {
    listarCategoriasPublicas: vi.fn(),
    listarMetodosEnvio: vi.fn(),
    buscarProductos: vi.fn(),
    obtenerProductoPublico: vi.fn(),
    crearCategoria: vi.fn(),
    actualizarCategoria: vi.fn(),
    eliminarCategoria: vi.fn(),
    crearProducto: vi.fn(),
    actualizarProducto: vi.fn(),
    cambiarEstadoProducto: vi.fn(),
    eliminarProducto: vi.fn(),
    agregarImagen: vi.fn(),
    eliminarImagen: vi.fn(),
    cambiarPrecioVariante: vi.fn(),
    cambiarEstadoVariante: vi.fn(),
    listarAtributos: vi.fn(),
  },
}));
vi.mock('../../../../src/shared/almacenamiento/imagenes.js', () => ({
  imagenes: { guardar: vi.fn(), borrar: vi.fn() },
}));
// Caché sin Redis: siempre carga de la base y lo informa como MISS.
vi.mock('../../../../src/shared/cache/cache.js', () => ({
  cache: {
    getOrSet: vi.fn(async (_clave: string, _ttl: number, cargar: () => Promise<unknown>) => ({
      valor: await cargar(),
      hit: false,
    })),
    claveVersionada: vi.fn(async (ns: string, resto: string) => `shopcart:${ns}:v0:${resto}`),
    invalidar: vi.fn(),
  },
}));

const repo = vi.mocked(catalogoRepository);
const cacheSimulada = vi.mocked(cache);

const ADMIN = 1;
const FECHA = new Date('2026-11-01T15:30:00.000Z');

const filaProducto: FilaProducto = {
  IDProducto: 20,
  Nombre: 'Sudadero',
  Descripcion: null,
  IDCategoria: 1,
  Categoria: 'Camisetas',
  CategoriaActiva: true,
  Activo: true,
  FechaCreacion: FECHA,
  FechaModificacion: null,
  TieneVentas: false,
  PuedeEliminarse: false,
};

const variante = (id: number, precio: number): FilaVariante => ({
  IDVariante: id,
  IDProducto: 20,
  SKU: `SUD-${id}`,
  Precio: precio,
  ExistenciaFisica: 10,
  ExistenciaReservada: 2,
  ExistenciaDisponible: 8,
  Activo: true,
  Descripcion: 'Talla M / Color Negro',
});

const valor = (idVariante: number, idAtributo: number, idValor: number): FilaValorVariante => ({
  IDVariante: idVariante,
  IDAtributo: idAtributo,
  Atributo: idAtributo === 1 ? 'Talla' : 'Color',
  IDValorAtributo: idValor,
  Valor: `v${idValor}`,
});

const detalle: ResultSetsProducto = {
  producto: filaProducto,
  variantes: [variante(30, 149), variante(31, 89.5)],
  valores: [valor(30, 1, 2), valor(30, 2, 12), valor(31, 1, 3)],
  imagenes: [{ IDProductoImagen: 5, Url: 'https://img/1.png', Orden: 0, EsPrincipal: true }],
};

const filaCategoria: FilaCategoria = {
  IDCategoria: 9,
  Nombre: 'Ofertas',
  Descripcion: null,
  Activo: true,
  CantidadProductos: 0,
  CantidadCupones: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('armarVariantesJson', () => {
  it('usa exactamente las claves sku, precio, existenciaInicial y valores, con el precio como texto', () => {
    const json = armarVariantesJson([
      { sku: 'A-1', precio: 149, existenciaInicial: 10, valores: [2, 12] },
      { sku: 'A-2', precio: 0.1 + 0.2, existenciaInicial: 0, valores: [] },
    ]);

    expect(JSON.parse(json)).toEqual([
      { sku: 'A-1', precio: '149.00', existenciaInicial: 10, valores: [2, 12] },
      { sku: 'A-2', precio: '0.30', existenciaInicial: 0, valores: [] },
    ]);
    expect(Object.keys(JSON.parse(json)[0] as object)).toEqual([
      'sku',
      'precio',
      'existenciaInicial',
      'valores',
    ]);
  });
});

describe('ensamblarProducto', () => {
  it('anida en cada variante sus valores de atributo y convierte montos y fechas', () => {
    const producto = ensamblarProducto(detalle);

    expect(producto).toMatchObject({
      idProducto: 20,
      categoriaActiva: true,
      fechaCreacion: '2026-11-01T15:30:00.000Z',
      fechaModificacion: null,
      puedeEliminarse: false,
      imagenes: [{ idProductoImagen: 5, url: 'https://img/1.png', orden: 0, esPrincipal: true }],
    });
    expect(producto.variantes).toHaveLength(2);
    expect(producto.variantes[0]).toEqual({
      idVariante: 30,
      idProducto: 20,
      sku: 'SUD-30',
      precio: '149.00',
      existenciaFisica: 10,
      existenciaReservada: 2,
      existenciaDisponible: 8,
      activo: true,
      descripcion: 'Talla M / Color Negro',
      valores: [
        { idAtributo: 1, atributo: 'Talla', idValorAtributo: 2, valor: 'v2' },
        { idAtributo: 2, atributo: 'Color', idValorAtributo: 12, valor: 'v12' },
      ],
    });
    expect(producto.variantes[1]?.precio).toBe('89.50');
    expect(producto.variantes[1]?.valores).toEqual([
      { idAtributo: 1, atributo: 'Talla', idValorAtributo: 3, valor: 'v3' },
    ]);
  });

  it('una variante sin valores lleva un arreglo vacío', () => {
    const producto = ensamblarProducto({ ...detalle, valores: [] });
    expect(producto.variantes.map((v) => v.valores)).toEqual([[], []]);
  });
});

describe('catalogoService: catálogo público', () => {
  it('obtenerProductoPublico arma variantes con existencia disponible y sus valores', async () => {
    repo.obtenerProductoPublico.mockResolvedValue({
      producto: {
        IDProducto: 5,
        Nombre: 'Tenis urbanos',
        Descripcion: null,
        IDCategoria: 3,
        Categoria: 'Calzado',
        PrecioMinimo: 459,
        PrecioMaximo: 459,
        Disponible: true,
        FechaCreacion: FECHA,
      },
      variantes: [
        { IDVariante: 11, SKU: 'T-40', Precio: 459, ExistenciaDisponible: 8, Descripcion: null },
      ],
      valores: [valor(11, 1, 8)],
      imagenes: [],
    });

    const producto = await catalogoService.obtenerProductoPublico(5);

    expect(producto.precioMinimo).toBe('459.00');
    expect(producto.variantes).toEqual([
      {
        idVariante: 11,
        sku: 'T-40',
        precio: '459.00',
        existenciaDisponible: 8,
        descripcion: null,
        valores: [{ idAtributo: 1, atributo: 'Talla', idValorAtributo: 8, valor: 'v8' }],
      },
    ]);
    // La existencia nunca pasa por la caché.
    expect(cacheSimulada.getOrSet).not.toHaveBeenCalled();
  });

  it('buscarProductos no usa la caché y responde { items, page, pageSize, total }', async () => {
    repo.buscarProductos.mockResolvedValue({
      filas: [
        {
          IDProducto: 1,
          Nombre: 'Camiseta',
          Descripcion: null,
          IDCategoria: 1,
          Categoria: 'Camisetas',
          PrecioMinimo: 89,
          PrecioMaximo: 95,
          Disponible: true,
          ImagenPrincipal: null,
          FechaCreacion: FECHA,
        },
      ],
      resultSets: [[], [{ Total: 7 }]],
      returnValue: 0,
    });

    const respuesta = await catalogoService.buscarProductos(
      { q: 'cami' },
      { page: 1, pageSize: 20, sort: 'precio:asc' },
    );

    expect(respuesta).toMatchObject({ page: 1, pageSize: 20, total: 7 });
    expect(respuesta.items[0]).toMatchObject({ precioMinimo: '89.00', precioMaximo: '95.00' });
    expect(cacheSimulada.getOrSet).not.toHaveBeenCalled();
  });

  it('las categorías públicas se cachean en el namespace catalogo con CACHE_TTL_CATALOGO_SEG', async () => {
    repo.listarCategoriasPublicas.mockResolvedValue([
      { IDCategoria: 1, Nombre: 'Camisetas', Descripcion: null, CantidadProductos: 2 },
    ]);

    const { valor: categorias, hit } = await catalogoService.listarCategoriasPublicas();

    expect(hit).toBe(false);
    expect(categorias).toEqual([
      { idCategoria: 1, nombre: 'Camisetas', descripcion: null, cantidadProductos: 2 },
    ]);
    expect(cacheSimulada.claveVersionada).toHaveBeenCalledWith('catalogo', 'categorias');
    expect(cacheSimulada.getOrSet).toHaveBeenCalledWith(
      'shopcart:catalogo:v0:categorias',
      env.CACHE_TTL_CATALOGO_SEG,
      expect.any(Function),
    );
  });

  it('los métodos de envío se cachean con el costo como string', async () => {
    repo.listarMetodosEnvio.mockResolvedValue([
      { IDMetodoEnvio: 1, Nombre: 'Estándar', Costo: 25, DiasEstimados: 3 },
    ]);

    const { valor: metodos } = await catalogoService.listarMetodosEnvio();

    expect(metodos).toEqual([
      { idMetodoEnvio: 1, nombre: 'Estándar', costo: '25.00', diasEstimados: 3 },
    ]);
    expect(cacheSimulada.claveVersionada).toHaveBeenCalledWith('catalogo', 'metodos-envio');
  });
});

describe('catalogoService: invalidación de la caché', () => {
  it('crear una categoría invalida catalogo después de que el SP confirmó', async () => {
    const orden: string[] = [];
    repo.crearCategoria.mockImplementation(async () => {
      orden.push('sp');
      return filaCategoria;
    });
    cacheSimulada.invalidar.mockImplementation(async () => {
      orden.push('invalidar');
    });

    const categoria = await catalogoService.crearCategoria(ADMIN, {
      nombre: 'Ofertas',
      descripcion: null,
    });

    expect(categoria).toMatchObject({ idCategoria: 9, activo: true, cantidadCupones: 0 });
    expect(repo.crearCategoria).toHaveBeenCalledWith(ADMIN, {
      nombre: 'Ofertas',
      descripcion: null,
    });
    expect(cacheSimulada.invalidar).toHaveBeenCalledWith('catalogo');
    expect(orden).toEqual(['sp', 'invalidar']);
  });

  it('si el SP falla no invalida', async () => {
    repo.actualizarCategoria.mockRejectedValue(new AppError('DUPLICADO', 'Ya existe.'));

    await expect(
      catalogoService.actualizarCategoria(ADMIN, 9, { nombre: 'Calzado', descripcion: null }),
    ).rejects.toMatchObject({ code: 'DUPLICADO' });
    expect(cacheSimulada.invalidar).not.toHaveBeenCalled();
  });

  it('actualizar un producto invalida catalogo después de que el SP confirmó', async () => {
    // Arrange
    const orden: string[] = [];
    repo.actualizarProducto.mockImplementation(async () => {
      orden.push('sp');
      return detalle;
    });
    cacheSimulada.invalidar.mockImplementation(async () => {
      orden.push('invalidar');
    });
    const datos = { nombre: 'Sudadero', descripcion: null, idCategoria: 1 };

    // Act
    const producto = await catalogoService.actualizarProducto(ADMIN, 20, datos);

    // Assert
    expect(producto.idProducto).toBe(20);
    expect(repo.actualizarProducto).toHaveBeenCalledWith(ADMIN, 20, datos);
    expect(orden).toEqual(['sp', 'invalidar']);
  });

  it('si el SP de cambiar estado del producto falla no invalida', async () => {
    // Arrange
    repo.cambiarEstadoProducto.mockRejectedValue(new AppError('NO_ENCONTRADO', 'No existe.'));

    // Act & Assert
    await expect(catalogoService.cambiarEstadoProducto(ADMIN, 99, false)).rejects.toMatchObject({
      code: 'NO_ENCONTRADO',
    });
    expect(cacheSimulada.invalidar).not.toHaveBeenCalled();
  });

  it('eliminar una categoría invalida', async () => {
    repo.eliminarCategoria.mockResolvedValue();
    await catalogoService.eliminarCategoria(ADMIN, 9);
    expect(cacheSimulada.invalidar).toHaveBeenCalledWith('catalogo');
  });

  it('crear un producto pasa @Variantes armado al repositorio e invalida', async () => {
    repo.crearProducto.mockResolvedValue(detalle);

    const producto = await catalogoService.crearProducto(ADMIN, {
      idCategoria: 1,
      nombre: 'Sudadero',
      descripcion: null,
      variantes: [{ sku: 'SUD-30', precio: 149, existenciaInicial: 10, valores: [2, 12] }],
    });

    expect(producto.variantes).toHaveLength(2);
    const [idUsuario, datos, variantesJson] = repo.crearProducto.mock.calls[0]!;
    expect(idUsuario).toBe(ADMIN);
    expect(datos).toEqual({ idCategoria: 1, nombre: 'Sudadero', descripcion: null });
    expect(JSON.parse(variantesJson)).toEqual([
      { sku: 'SUD-30', precio: '149.00', existenciaInicial: 10, valores: [2, 12] },
    ]);
    expect(cacheSimulada.invalidar).toHaveBeenCalledWith('catalogo');
  });

  it('desactivar una variante invalida (puede ocultar su producto)', async () => {
    repo.cambiarEstadoVariante.mockResolvedValue({ variante: variante(30, 149), valores: [] });
    await catalogoService.cambiarEstadoVariante(ADMIN, 30, false);
    expect(cacheSimulada.invalidar).toHaveBeenCalledWith('catalogo');
  });

  it('cambiar el precio o agregar una imagen no invalida: no están en lo cacheado', async () => {
    repo.cambiarPrecioVariante.mockResolvedValue({ variante: variante(30, 149), valores: [] });
    repo.agregarImagen.mockResolvedValue(detalle);

    const cambiada = await catalogoService.cambiarPrecioVariante(ADMIN, 30, 149);
    await catalogoService.agregarImagen(ADMIN, 20, {
      url: 'https://img/2.png',
      orden: 1,
      esPrincipal: false,
    });

    expect(cambiada.precio).toBe('149.00');
    expect(cacheSimulada.invalidar).not.toHaveBeenCalled();
  });
});

describe('imágenes subidas al servidor', () => {
  const archivo = Buffer.from('contenido');
  const datos = { orden: 0, esPrincipal: true };
  const URL_PROPIA = '/api/imagenes/productos/0f8fad5b-d9cb-469f-a165-70867728950e.png';

  it('subirImagen guarda el archivo y registra su URL relativa en el SP', async () => {
    // Arrange
    vi.mocked(imagenes.guardar).mockResolvedValue(URL_PROPIA);
    repo.agregarImagen.mockResolvedValue(detalle);

    // Act
    const producto = await catalogoService.subirImagen(ADMIN, 20, archivo, datos);

    // Assert
    expect(repo.agregarImagen).toHaveBeenCalledWith(ADMIN, 20, { ...datos, url: URL_PROPIA });
    expect(producto.idProducto).toBe(20);
    expect(imagenes.borrar).not.toHaveBeenCalled();
  });

  it('subirImagen con un tipo no permitido responde 415 y no llama al SP', async () => {
    // Arrange
    vi.mocked(imagenes.guardar).mockResolvedValue(undefined);

    // Act
    const resultado = catalogoService.subirImagen(ADMIN, 20, archivo, datos);

    // Assert
    await expect(resultado).rejects.toMatchObject({
      code: 'TIPO_ARCHIVO_NO_PERMITIDO',
      status: 415,
    });
    expect(repo.agregarImagen).not.toHaveBeenCalled();
  });

  it('subirImagen borra el archivo si el SP rechaza', async () => {
    // Arrange
    vi.mocked(imagenes.guardar).mockResolvedValue(URL_PROPIA);
    repo.agregarImagen.mockRejectedValue(new AppError('NO_ENCONTRADO', 'No existe.'));

    // Act
    const resultado = catalogoService.subirImagen(ADMIN, 20, archivo, datos);

    // Assert
    await expect(resultado).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    expect(imagenes.borrar).toHaveBeenCalledWith(URL_PROPIA);
  });

  it('eliminarImagen borra el archivo después de que el SP confirmó', async () => {
    // Arrange
    repo.eliminarImagen.mockResolvedValue(URL_PROPIA);

    // Act
    await catalogoService.eliminarImagen(ADMIN, 20, 5);

    // Assert
    expect(imagenes.borrar).toHaveBeenCalledWith(URL_PROPIA);
  });

  it('eliminarImagen no borra nada si el SP falla', async () => {
    // Arrange
    repo.eliminarImagen.mockRejectedValue(new AppError('NO_ENCONTRADO', 'No existe.'));

    // Act
    const resultado = catalogoService.eliminarImagen(ADMIN, 20, 5);

    // Assert
    await expect(resultado).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    expect(imagenes.borrar).not.toHaveBeenCalled();
  });

  it('eliminarProducto borra los archivos de todas sus imágenes e invalida la caché', async () => {
    // Arrange
    repo.eliminarProducto.mockResolvedValue([URL_PROPIA, 'https://img/externa.png']);

    // Act
    await catalogoService.eliminarProducto(ADMIN, 20);

    // Assert
    expect(imagenes.borrar).toHaveBeenCalledTimes(2);
    expect(cacheSimulada.invalidar).toHaveBeenCalledWith('catalogo');
  });

  it('un fallo al borrar un archivo no hace fallar la operación', async () => {
    // Arrange
    repo.eliminarProducto.mockResolvedValue([URL_PROPIA]);
    vi.mocked(imagenes.borrar).mockRejectedValueOnce(new Error('EACCES'));

    // Act
    const resultado = catalogoService.eliminarProducto(ADMIN, 20);

    // Assert
    await expect(resultado).resolves.toBeUndefined();
  });
});

describe('catalogoService.listarAtributos', () => {
  it('agrupa los valores bajo su atributo', async () => {
    repo.listarAtributos.mockResolvedValue({
      atributos: [
        { IDAtributo: 1, Nombre: 'Talla', CantidadValores: 2 },
        { IDAtributo: 2, Nombre: 'Color', CantidadValores: 1 },
      ],
      valores: [
        { IDValorAtributo: 1, IDAtributo: 1, Valor: 'S', CantidadVariantes: 0 },
        { IDValorAtributo: 2, IDAtributo: 1, Valor: 'M', CantidadVariantes: 4 },
        { IDValorAtributo: 12, IDAtributo: 2, Valor: 'Negro', CantidadVariantes: 6 },
      ],
    });

    const atributos = await catalogoService.listarAtributos();

    expect(atributos).toEqual([
      {
        idAtributo: 1,
        nombre: 'Talla',
        cantidadValores: 2,
        valores: [
          { idValorAtributo: 1, valor: 'S', cantidadVariantes: 0 },
          { idValorAtributo: 2, valor: 'M', cantidadVariantes: 4 },
        ],
      },
      {
        idAtributo: 2,
        nombre: 'Color',
        cantidadValores: 1,
        valores: [{ idValorAtributo: 12, valor: 'Negro', cantidadVariantes: 6 }],
      },
    ]);
  });
});
