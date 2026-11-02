import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configuracionRepository } from '../../../../src/modules/configuracion/configuracion.repository.js';
import { configuracionService } from '../../../../src/modules/configuracion/configuracion.service.js';
import { cache } from '../../../../src/shared/cache/cache.js';

vi.mock('../../../../src/modules/configuracion/configuracion.repository.js', () => ({
  configuracionRepository: { listar: vi.fn(), actualizar: vi.fn() },
}));
vi.mock('../../../../src/shared/cache/cache.js', () => ({
  cache: {
    getOrSet: vi.fn(async (_c: string, _t: number, cargar: () => Promise<unknown>) => ({
      valor: await cargar(),
      hit: false,
    })),
    borrar: vi.fn(),
    invalidar: vi.fn(),
  },
}));

const repo = vi.mocked(configuracionRepository);
const fila = { IDConfiguracion: 2, Clave: 'MinutosReserva', Valor: '15', Descripcion: 'Minutos' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('configuracionService', () => {
  it('lista mapeando a camelCase mediante la caché', async () => {
    // Arrange
    repo.listar.mockResolvedValue([fila]);

    // Act
    const { valor, hit } = await configuracionService.listar();

    // Assert
    expect(hit).toBe(false);
    expect(valor).toEqual([
      { idConfiguracion: 2, clave: 'MinutosReserva', valor: '15', descripcion: 'Minutos' },
    ]);
    expect(cache.getOrSet).toHaveBeenCalledWith(
      'shopcart:configuracion',
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('actualiza y borra la caché después del SP', async () => {
    // Arrange
    repo.actualizar.mockResolvedValue({ ...fila, Valor: '20' });

    // Act
    const parametro = await configuracionService.actualizar(1, 'MinutosReserva', '20');

    // Assert
    expect(parametro.valor).toBe('20');
    expect(repo.actualizar).toHaveBeenCalledWith(1, 'MinutosReserva', '20');
    expect(cache.borrar).toHaveBeenCalledWith('shopcart:configuracion');
  });

  it('actualizar invalida reportes después de borrar la caché de configuración', async () => {
    // Arrange
    const orden: string[] = [];
    repo.actualizar.mockResolvedValue({ ...fila, Valor: '20' });
    vi.mocked(cache.borrar).mockImplementation(async () => {
      orden.push('borrar');
    });
    vi.mocked(cache.invalidar).mockImplementation(async () => {
      orden.push('invalidar');
    });

    // Act
    await configuracionService.actualizar(1, 'HorasCarritoAbandonado', '48');

    // Assert
    expect(cache.invalidar).toHaveBeenCalledWith('reportes');
    expect(orden).toEqual(['borrar', 'invalidar']);
  });

  it('si el SP falla no borra ni invalida nada', async () => {
    // Arrange
    repo.actualizar.mockRejectedValue(new Error('SP falló'));

    // Act & Assert
    await expect(configuracionService.actualizar(1, 'X', '1')).rejects.toThrow('SP falló');
    expect(cache.borrar).not.toHaveBeenCalled();
    expect(cache.invalidar).not.toHaveBeenCalled();
  });
});
