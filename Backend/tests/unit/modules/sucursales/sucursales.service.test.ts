import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sucursalesRepository } from '../../../../src/modules/sucursales/sucursales.repository.js';
import { sucursalesService } from '../../../../src/modules/sucursales/sucursales.service.js';
import type {
  DatosSucursal,
  FilaSucursal,
} from '../../../../src/modules/sucursales/sucursales.types.js';
import { cache } from '../../../../src/shared/cache/cache.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';

vi.mock('../../../../src/modules/sucursales/sucursales.repository.js', () => ({
  sucursalesRepository: {
    listarPublicas: vi.fn(),
    listar: vi.fn(),
    obtener: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
  },
}));

vi.mock('../../../../src/shared/cache/cache.js', () => ({
  cache: {
    claveVersionada: vi.fn(async (ns: string, nombre: string) => `shopcart:${ns}:v0:${nombre}`),
    getOrSet: vi.fn(async (_clave: string, _ttl: number, cargar: () => Promise<unknown>) => ({
      valor: await cargar(),
      hit: false,
    })),
    invalidar: vi.fn(),
  },
}));

const repo = vi.mocked(sucursalesRepository);
const cacheSimulada = vi.mocked(cache);

const fila: FilaSucursal = {
  IDSucursal: 1,
  Nombre: 'Sucursal Zona 10',
  Telefono: '22223333',
  Linea1: '6a. avenida 12-34, zona 10',
  Linea2: null,
  Municipio: 'Guatemala',
  Departamento: 'Guatemala',
  CodigoPostal: '01010',
  Horario: 'Lun-Sáb 9:00-18:00',
  Activo: true,
  CantidadPedidos: 2,
  FechaCreacion: new Date('2026-11-01T10:00:00Z'),
  FechaModificacion: new Date('2026-11-02T10:00:00Z'),
};

const datos: DatosSucursal = {
  nombre: fila.Nombre,
  telefono: fila.Telefono,
  linea1: fila.Linea1,
  linea2: null,
  municipio: fila.Municipio,
  departamento: fila.Departamento,
  codigoPostal: fila.CodigoPostal,
  horario: fila.Horario,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sucursalesService', () => {
  it('las públicas se cachean en el namespace catalogo y no exponen estado ni fechas', async () => {
    // Arrange
    repo.listarPublicas.mockResolvedValue([fila]);

    // Act
    const { valor } = await sucursalesService.listarPublicas();

    // Assert
    expect(cacheSimulada.claveVersionada).toHaveBeenCalledWith('catalogo', 'sucursales');
    expect(valor[0]).not.toHaveProperty('activo');
    expect(valor[0]).not.toHaveProperty('cantidadPedidos');
    expect(valor[0]).toMatchObject({ idSucursal: 1, nombre: 'Sucursal Zona 10' });
  });

  it('obtener mapea a camelCase con fechas ISO', async () => {
    // Arrange
    repo.obtener.mockResolvedValue(fila);

    // Act
    const sucursal = await sucursalesService.obtener(1);

    // Assert
    expect(sucursal).toMatchObject({
      idSucursal: 1,
      activo: true,
      cantidadPedidos: 2,
      fechaCreacion: '2026-11-01T10:00:00.000Z',
      fechaModificacion: '2026-11-02T10:00:00.000Z',
    });
  });

  it('listar devuelve la forma paginada', async () => {
    // Arrange
    repo.listar.mockResolvedValue({
      filas: [fila],
      resultSets: [[fila], [{ Total: 7 }]],
      returnValue: 0,
    });

    // Act
    const pagina = await sucursalesService.listar(
      1,
      { q: 'zona' },
      { page: 2, pageSize: 1, sort: 'nombre:asc' },
    );

    // Assert
    expect(pagina).toMatchObject({ page: 2, pageSize: 1, total: 7 });
    expect(pagina.items).toHaveLength(1);
  });

  it.each([
    ['crear', () => sucursalesService.crear(1, datos), repo.crear],
    ['actualizar', () => sucursalesService.actualizar(1, 1, datos), repo.actualizar],
    ['cambiarEstado', () => sucursalesService.cambiarEstado(1, 1, false), repo.cambiarEstado],
  ])('%s invalida catalogo después de que el SP confirmó', async (_nombre, accion, mock) => {
    // Arrange
    const orden: string[] = [];
    mock.mockImplementation(async () => {
      orden.push('sp');
      return fila;
    });
    cacheSimulada.invalidar.mockImplementation(async () => {
      orden.push('invalidar');
    });

    // Act
    await accion();

    // Assert
    expect(cacheSimulada.invalidar).toHaveBeenCalledWith('catalogo');
    expect(orden).toEqual(['sp', 'invalidar']);
  });

  it('eliminar invalida catalogo', async () => {
    // Arrange
    repo.eliminar.mockResolvedValue();

    // Act
    await sucursalesService.eliminar(1, 1);

    // Assert
    expect(cacheSimulada.invalidar).toHaveBeenCalledWith('catalogo');
  });

  it('si el SP falla (EN_USO) no invalida la caché', async () => {
    // Arrange
    repo.eliminar.mockRejectedValue(new AppError('EN_USO', 'Tiene pedidos.'));

    // Act
    const accion = sucursalesService.eliminar(1, 1);

    // Assert
    await expect(accion).rejects.toMatchObject({ code: 'EN_USO' });
    expect(cacheSimulada.invalidar).not.toHaveBeenCalled();
  });
});
