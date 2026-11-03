import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tarjetasController } from '../../../../src/modules/tarjetas/tarjetas.controller.js';
import { tarjetasService } from '../../../../src/modules/tarjetas/tarjetas.service.js';
import type { Tarjeta } from '../../../../src/modules/tarjetas/tarjetas.types.js';

vi.mock('../../../../src/modules/tarjetas/tarjetas.service.js', () => ({
  tarjetasService: {
    listar: vi.fn(),
    crear: vi.fn(),
    marcarPredeterminada: vi.fn(),
    eliminar: vi.fn(),
  },
}));

const TARJETA: Tarjeta = {
  idTarjeta: 7,
  titular: 'Ana López',
  ultimos4: '4242',
  tipo: 'CREDITO',
  marca: 'VISA',
  predeterminada: true,
  fechaCreacion: '2026-11-02T15:00:00.000Z',
};

function entorno(validado: unknown = {}) {
  const res = {
    locals: { validado },
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  const req = { usuario: { idUsuario: 5, rol: 'Cliente' } };
  return { req: req as unknown as Request, res: res as unknown as Response & typeof res };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tarjetasController', () => {
  it('listar usa el id del JWT y responde 200 con el arreglo', async () => {
    // Arrange
    vi.mocked(tarjetasService.listar).mockResolvedValue([TARJETA]);
    const { req, res } = entorno();

    // Act
    await tarjetasController.listar(req, res);

    // Assert
    expect(tarjetasService.listar).toHaveBeenCalledWith(5);
    expect(res.json).toHaveBeenCalledWith([TARJETA]);
  });

  it('crear responde 201 y pasa el body validado con el id del JWT', async () => {
    // Arrange
    const body = { titular: 'Ana López', ultimos4: '4242', tipo: 'CREDITO', marca: 'VISA' };
    vi.mocked(tarjetasService.crear).mockResolvedValue(TARJETA);
    const { req, res } = entorno({ body });

    // Act
    await tarjetasController.crear(req, res);

    // Assert
    expect(tarjetasService.crear).toHaveBeenCalledWith(5, body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(TARJETA);
  });

  it('marcarPredeterminada responde 200 con la tarjeta del id de la URL', async () => {
    // Arrange
    vi.mocked(tarjetasService.marcarPredeterminada).mockResolvedValue(TARJETA);
    const { req, res } = entorno({ params: { id: 7 } });

    // Act
    await tarjetasController.marcarPredeterminada(req, res);

    // Assert
    expect(tarjetasService.marcarPredeterminada).toHaveBeenCalledWith(5, 7);
    expect(res.json).toHaveBeenCalledWith(TARJETA);
  });

  it('eliminar responde 204 sin cuerpo', async () => {
    // Arrange
    vi.mocked(tarjetasService.eliminar).mockResolvedValue(undefined);
    const { req, res } = entorno({ params: { id: 7 } });

    // Act
    await tarjetasController.eliminar(req, res);

    // Assert
    expect(tarjetasService.eliminar).toHaveBeenCalledWith(5, 7);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
