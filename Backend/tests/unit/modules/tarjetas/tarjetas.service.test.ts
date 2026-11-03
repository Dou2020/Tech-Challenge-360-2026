import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tarjetasRepository } from '../../../../src/modules/tarjetas/tarjetas.repository.js';
import { tarjetasService } from '../../../../src/modules/tarjetas/tarjetas.service.js';

vi.mock('../../../../src/modules/tarjetas/tarjetas.repository.js');

const repo = vi.mocked(tarjetasRepository);

const fila = {
  IDTarjetaGuardada: 4,
  Titular: 'Ana López',
  Ultimos4: '4242',
  Tipo: 'CREDITO',
  Marca: 'VISA',
  Predeterminada: true,
  FechaCreacion: new Date('2026-11-02T15:30:00.000Z'),
};

const tarjeta = {
  idTarjeta: 4,
  titular: 'Ana López',
  ultimos4: '4242',
  tipo: 'CREDITO',
  marca: 'VISA',
  predeterminada: true,
  fechaCreacion: '2026-11-02T15:30:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('tarjetasService', () => {
  it('listar traduce las filas al DTO con la fecha en ISO', async () => {
    // Arrange
    repo.listar.mockResolvedValue([fila]);

    // Act
    const resultado = await tarjetasService.listar(7);

    // Assert
    expect(resultado).toEqual([tarjeta]);
    expect(repo.listar).toHaveBeenCalledWith(7);
  });

  it('crear pasa el id del token y devuelve la tarjeta', async () => {
    // Arrange
    repo.crear.mockResolvedValue(fila);
    const datos = {
      titular: 'Ana López',
      ultimos4: '4242',
      tipo: 'CREDITO',
      marca: 'VISA',
      predeterminada: false,
    };

    // Act
    const resultado = await tarjetasService.crear(7, datos);

    // Assert
    expect(resultado).toEqual(tarjeta);
    expect(repo.crear).toHaveBeenCalledWith(7, datos);
  });

  it('marcarPredeterminada devuelve la tarjeta marcada', async () => {
    // Arrange
    repo.marcarPredeterminada.mockResolvedValue(fila);

    // Act
    const resultado = await tarjetasService.marcarPredeterminada(7, 4);

    // Assert
    expect(resultado).toEqual(tarjeta);
    expect(repo.marcarPredeterminada).toHaveBeenCalledWith(7, 4);
  });

  it('eliminar delega en el repositorio', async () => {
    // Arrange
    repo.eliminar.mockResolvedValue(undefined);

    // Act
    await tarjetasService.eliminar(7, 4);

    // Assert
    expect(repo.eliminar).toHaveBeenCalledWith(7, 4);
  });
});
