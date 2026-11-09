import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sucursalesController } from '../../../../src/modules/sucursales/sucursales.controller.js';
import { sucursalesService } from '../../../../src/modules/sucursales/sucursales.service.js';
import type { Sucursal } from '../../../../src/modules/sucursales/sucursales.types.js';

vi.mock('../../../../src/modules/sucursales/sucursales.service.js', () => ({
  sucursalesService: {
    listarPublicas: vi.fn(),
    listar: vi.fn(),
    obtener: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
  },
}));

const SUCURSAL = { idSucursal: 3, nombre: 'Sucursal Mixco' } as Sucursal;

function entorno(validado: unknown = {}) {
  const res = {
    locals: { validado },
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  const req = { usuario: { idUsuario: 1, rol: 'Administrador' } };
  return { req: req as unknown as Request, res: res as unknown as Response & typeof res };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sucursalesController', () => {
  it.each([
    [true, 'HIT'],
    [false, 'MISS'],
  ])('publicas con hit=%s responde X-Cache %s', async (hit, cabecera) => {
    // Arrange
    vi.mocked(sucursalesService.listarPublicas).mockResolvedValue({ valor: [], hit });
    const { req, res } = entorno();

    // Act
    await sucursalesController.publicas(req, res);

    // Assert
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', cabecera);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('listar separa la paginación de los filtros y usa el id del JWT', async () => {
    // Arrange
    const pagina = { items: [], page: 2, pageSize: 5, total: 0 };
    vi.mocked(sucursalesService.listar).mockResolvedValue(pagina);
    const { req, res } = entorno({
      query: { q: 'zona', activo: true, page: 2, pageSize: 5, sort: 'nombre:desc' },
    });

    // Act
    await sucursalesController.listar(req, res);

    // Assert
    expect(sucursalesService.listar).toHaveBeenCalledWith(
      1,
      { q: 'zona', activo: true },
      { page: 2, pageSize: 5, sort: 'nombre:desc' },
    );
    expect(res.json).toHaveBeenCalledWith(pagina);
  });

  it('obtener responde con la sucursal del id de la URL', async () => {
    // Arrange
    vi.mocked(sucursalesService.obtener).mockResolvedValue(SUCURSAL);
    const { req, res } = entorno({ params: { id: 3 } });

    // Act
    await sucursalesController.obtener(req, res);

    // Assert
    expect(sucursalesService.obtener).toHaveBeenCalledWith(3);
    expect(res.json).toHaveBeenCalledWith(SUCURSAL);
  });

  it('crear responde 201 con el id del JWT y el body validado', async () => {
    // Arrange
    const body = { nombre: 'Sucursal Mixco' };
    vi.mocked(sucursalesService.crear).mockResolvedValue(SUCURSAL);
    const { req, res } = entorno({ body });

    // Act
    await sucursalesController.crear(req, res);

    // Assert
    expect(sucursalesService.crear).toHaveBeenCalledWith(1, body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(SUCURSAL);
  });

  it('actualizar responde 200 con id de la URL y el body', async () => {
    // Arrange
    const body = { nombre: 'Sucursal Mixco B' };
    vi.mocked(sucursalesService.actualizar).mockResolvedValue(SUCURSAL);
    const { req, res } = entorno({ params: { id: 3 }, body });

    // Act
    await sucursalesController.actualizar(req, res);

    // Assert
    expect(sucursalesService.actualizar).toHaveBeenCalledWith(1, 3, body);
    expect(res.json).toHaveBeenCalledWith(SUCURSAL);
  });

  it('cambiarEstado pasa el booleano de activo', async () => {
    // Arrange
    vi.mocked(sucursalesService.cambiarEstado).mockResolvedValue(SUCURSAL);
    const { req, res } = entorno({ params: { id: 3 }, body: { activo: false } });

    // Act
    await sucursalesController.cambiarEstado(req, res);

    // Assert
    expect(sucursalesService.cambiarEstado).toHaveBeenCalledWith(1, 3, false);
    expect(res.json).toHaveBeenCalledWith(SUCURSAL);
  });

  it('eliminar responde 204 sin cuerpo', async () => {
    // Arrange
    vi.mocked(sucursalesService.eliminar).mockResolvedValue();
    const { req, res } = entorno({ params: { id: 3 } });

    // Act
    await sucursalesController.eliminar(req, res);

    // Assert
    expect(sucursalesService.eliminar).toHaveBeenCalledWith(1, 3);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
