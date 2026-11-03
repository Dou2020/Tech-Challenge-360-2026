import sql from 'mssql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSp } from '../../../../src/db/executeSp.js';
import { tarjetasRepository } from '../../../../src/modules/tarjetas/tarjetas.repository.js';
import type { FilaTarjeta } from '../../../../src/modules/tarjetas/tarjetas.types.js';

vi.mock('../../../../src/db/executeSp.js', () => ({ executeSp: vi.fn() }));

const FILA: FilaTarjeta = {
  IDTarjetaGuardada: 7,
  Titular: 'Ana López',
  Ultimos4: '4242',
  Tipo: 'CREDITO',
  Marca: 'VISA',
  Predeterminada: true,
  FechaCreacion: new Date('2026-11-02T15:00:00.000Z'),
};

const resultado = (filas: FilaTarjeta[]) => ({ filas, resultSets: [filas], returnValue: 0 });

const DATOS = {
  titular: 'Ana López',
  ultimos4: '4242',
  tipo: 'CREDITO',
  marca: 'VISA',
  predeterminada: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tarjetasRepository.listar', () => {
  it('llama a SP_Tarjetas_Listar solo con el solicitante y devuelve las filas', async () => {
    // Arrange
    vi.mocked(executeSp).mockResolvedValue(resultado([FILA]));

    // Act
    const filas = await tarjetasRepository.listar(5);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Tarjetas_Listar', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 5 },
    ]);
    expect(filas).toEqual([FILA]);
  });
});

describe('tarjetasRepository.crear', () => {
  it('envía los seis parámetros con sus tipos y devuelve la fila', async () => {
    // Arrange
    vi.mocked(executeSp).mockResolvedValue(resultado([FILA]));

    // Act
    const fila = await tarjetasRepository.crear(5, DATOS);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Tarjetas_Crear', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 5 },
      { nombre: 'Titular', tipo: sql.NVarChar(150), valor: 'Ana López' },
      { nombre: 'Ultimos4', tipo: sql.Char(4), valor: '4242' },
      { nombre: 'Tipo', tipo: sql.NVarChar(10), valor: 'CREDITO' },
      { nombre: 'Marca', tipo: sql.NVarChar(20), valor: 'VISA' },
      { nombre: 'Predeterminada', tipo: sql.Bit, valor: true },
    ]);
    expect(fila).toBe(FILA);
  });

  it('falla si el SP no devuelve filas', async () => {
    // Arrange
    vi.mocked(executeSp).mockResolvedValue(resultado([]));

    // Act & Assert
    await expect(tarjetasRepository.crear(5, DATOS)).rejects.toThrow('SP_Tarjetas_Crear');
  });
});

describe('tarjetasRepository.marcarPredeterminada', () => {
  it('envía solicitante e IDTarjetaGuardada y devuelve la fila', async () => {
    // Arrange
    vi.mocked(executeSp).mockResolvedValue(resultado([FILA]));

    // Act
    const fila = await tarjetasRepository.marcarPredeterminada(5, 7);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Tarjetas_MarcarPredeterminada', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 5 },
      { nombre: 'IDTarjetaGuardada', tipo: sql.Int, valor: 7 },
    ]);
    expect(fila).toBe(FILA);
  });

  it('falla si el SP no devuelve filas', async () => {
    // Arrange
    vi.mocked(executeSp).mockResolvedValue(resultado([]));

    // Act & Assert
    await expect(tarjetasRepository.marcarPredeterminada(5, 7)).rejects.toThrow(
      'SP_Tarjetas_MarcarPredeterminada',
    );
  });
});

describe('tarjetasRepository.eliminar', () => {
  it('envía solicitante e IDTarjetaGuardada a SP_Tarjetas_Eliminar', async () => {
    // Arrange
    vi.mocked(executeSp).mockResolvedValue(resultado([]));

    // Act
    await tarjetasRepository.eliminar(5, 7);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Tarjetas_Eliminar', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 5 },
      { nombre: 'IDTarjetaGuardada', tipo: sql.Int, valor: 7 },
    ]);
  });
});
