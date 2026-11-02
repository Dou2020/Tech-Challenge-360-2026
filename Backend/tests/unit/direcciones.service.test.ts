import { beforeEach, describe, expect, it, vi } from 'vitest';
import { direccionesRepository } from '../../src/modules/direcciones/direcciones.repository.js';
import { direccionesService } from '../../src/modules/direcciones/direcciones.service.js';
import type { FilaDireccion } from '../../src/modules/direcciones/direcciones.types.js';
import { AppError } from '../../src/shared/errors/AppError.js';

vi.mock('../../src/modules/direcciones/direcciones.repository.js', () => ({
  direccionesRepository: {
    listar: vi.fn(),
    obtener: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    desactivar: vi.fn(),
  },
}));

const repo = vi.mocked(direccionesRepository);
const CLIENTE = 3;

const fila: FilaDireccion = {
  IDDireccion: 1,
  Alias: 'Casa',
  NombreDestinatario: 'Ana López',
  Telefono: '55510003',
  Linea1: '5a. avenida 10-25, zona 1',
  Linea2: null,
  Municipio: 'Guatemala',
  Departamento: 'Guatemala',
  CodigoPostal: '01001',
  Referencias: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('direccionesService', () => {
  it('lista con el id del cliente y mapea a camelCase', async () => {
    repo.listar.mockResolvedValue([fila]);

    expect(await direccionesService.listar(CLIENTE)).toEqual([
      {
        idDireccion: 1,
        alias: 'Casa',
        nombreDestinatario: 'Ana López',
        telefono: '55510003',
        linea1: '5a. avenida 10-25, zona 1',
        linea2: null,
        municipio: 'Guatemala',
        departamento: 'Guatemala',
        codigoPostal: '01001',
        referencias: null,
      },
    ]);
    expect(repo.listar).toHaveBeenCalledWith(CLIENTE);
  });

  it('una dirección ajena llega del SP como NO_ENCONTRADO y se propaga tal cual', async () => {
    repo.obtener.mockRejectedValue(new AppError('NO_ENCONTRADO', 'La dirección no existe.'));

    await expect(direccionesService.obtener(CLIENTE, 3)).rejects.toMatchObject({
      code: 'NO_ENCONTRADO',
      status: 404,
    });
    expect(repo.obtener).toHaveBeenCalledWith(CLIENTE, 3);
  });

  it('eliminar hace la baja lógica con el id del cliente', async () => {
    repo.desactivar.mockResolvedValue();
    await direccionesService.eliminar(CLIENTE, 2);
    expect(repo.desactivar).toHaveBeenCalledWith(CLIENTE, 2);
  });
});
