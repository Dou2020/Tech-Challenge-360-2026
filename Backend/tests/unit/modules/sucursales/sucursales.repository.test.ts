import sql from 'mssql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSp } from '../../../../src/db/executeSp.js';
import { sucursalesRepository } from '../../../../src/modules/sucursales/sucursales.repository.js';
import type {
  DatosSucursal,
  FilaSucursal,
} from '../../../../src/modules/sucursales/sucursales.types.js';

vi.mock('../../../../src/db/executeSp.js', () => ({ executeSp: vi.fn() }));

const FILA = { IDSucursal: 3 } as FilaSucursal;

const DATOS: DatosSucursal = {
  nombre: 'Sucursal Mixco',
  telefono: '2222-3333',
  linea1: 'Calzada Roosevelt 10-20',
  linea2: null,
  municipio: 'Mixco',
  departamento: 'Guatemala',
  codigoPostal: null,
  horario: 'Lun-Vie 9-17',
};

const PARAMETROS_DATOS = [
  { nombre: 'Nombre', tipo: sql.NVarChar(100), valor: 'Sucursal Mixco' },
  { nombre: 'Telefono', tipo: sql.NVarChar(20), valor: '2222-3333' },
  { nombre: 'Linea1', tipo: sql.NVarChar(200), valor: 'Calzada Roosevelt 10-20' },
  { nombre: 'Linea2', tipo: sql.NVarChar(200), valor: null },
  { nombre: 'Municipio', tipo: sql.NVarChar(100), valor: 'Mixco' },
  { nombre: 'Departamento', tipo: sql.NVarChar(100), valor: 'Guatemala' },
  { nombre: 'CodigoPostal', tipo: sql.NVarChar(10), valor: null },
  { nombre: 'Horario', tipo: sql.NVarChar(200), valor: 'Lun-Vie 9-17' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(executeSp).mockResolvedValue({ filas: [FILA], resultSets: [[FILA]], returnValue: 0 });
});

describe('sucursalesRepository', () => {
  it('listarPublicas llama a SP_Catalogo_ListarSucursales sin parámetros', async () => {
    // Act
    await sucursalesRepository.listarPublicas();

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Catalogo_ListarSucursales');
  });

  it('listar envía solicitante, filtros y paginación', async () => {
    // Act
    await sucursalesRepository.listar(
      1,
      { q: 'zona', activo: false },
      { page: 2, pageSize: 5, sort: 'cantidadPedidos:desc' },
    );

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Sucursales_Listar', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 1 },
      { nombre: 'Q', tipo: sql.NVarChar(100), valor: 'zona' },
      { nombre: 'Activo', tipo: sql.Bit, valor: false },
      { nombre: 'Pagina', tipo: sql.Int, valor: 2 },
      { nombre: 'TamanoPagina', tipo: sql.Int, valor: 5 },
      { nombre: 'Orden', tipo: sql.NVarChar(50), valor: 'cantidadPedidos:desc' },
    ]);
  });

  it('listar sin filtros manda NULL en Q y Activo', async () => {
    // Act
    await sucursalesRepository.listar(1, {}, { page: 1, pageSize: 20, sort: 'nombre:asc' });

    // Assert
    const parametros = vi.mocked(executeSp).mock.calls[0]![1] ?? [];
    expect(parametros.find((p) => p.nombre === 'Q')?.valor).toBeNull();
    expect(parametros.find((p) => p.nombre === 'Activo')?.valor).toBeNull();
  });

  it('obtener no manda solicitante, solo IDSucursal', async () => {
    // Act
    const fila = await sucursalesRepository.obtener(3);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Sucursales_ObtenerPorId', [
      { nombre: 'IDSucursal', tipo: sql.Int, valor: 3 },
    ]);
    expect(fila).toBe(FILA);
  });

  it('crear envía solicitante y los 8 datos con sus tipos', async () => {
    // Act
    await sucursalesRepository.crear(1, DATOS);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Sucursales_Crear', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 1 },
      ...PARAMETROS_DATOS,
    ]);
  });

  it('actualizar envía solicitante, id y los datos', async () => {
    // Act
    await sucursalesRepository.actualizar(1, 3, DATOS);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Sucursales_Actualizar', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 1 },
      { nombre: 'IDSucursal', tipo: sql.Int, valor: 3 },
      ...PARAMETROS_DATOS,
    ]);
  });

  it('cambiarEstado envía solicitante, id y Activo como BIT', async () => {
    // Act
    await sucursalesRepository.cambiarEstado(1, 3, false);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Sucursales_CambiarEstado', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 1 },
      { nombre: 'IDSucursal', tipo: sql.Int, valor: 3 },
      { nombre: 'Activo', tipo: sql.Bit, valor: false },
    ]);
  });

  it('eliminar envía solicitante e id', async () => {
    // Act
    await sucursalesRepository.eliminar(1, 3);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Sucursales_Eliminar', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 1 },
      { nombre: 'IDSucursal', tipo: sql.Int, valor: 3 },
    ]);
  });

  it.each([
    ['obtener', () => sucursalesRepository.obtener(3)],
    ['crear', () => sucursalesRepository.crear(1, DATOS)],
    ['actualizar', () => sucursalesRepository.actualizar(1, 3, DATOS)],
    ['cambiarEstado', () => sucursalesRepository.cambiarEstado(1, 3, true)],
  ])('%s falla si el SP no devuelve filas', async (_nombre, accion) => {
    // Arrange
    vi.mocked(executeSp).mockResolvedValue({ filas: [], resultSets: [[]], returnValue: 0 });

    // Act & Assert
    await expect(accion()).rejects.toThrow('no devolvió filas');
  });
});
