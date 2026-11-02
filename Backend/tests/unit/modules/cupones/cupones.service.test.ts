import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cuponesRepository } from '../../../../src/modules/cupones/cupones.repository.js';
import { aCupon, aUso, cuponesService } from '../../../../src/modules/cupones/cupones.service.js';
import type {
  DatosCupon,
  FilaCupon,
  FilaUsoCupon,
} from '../../../../src/modules/cupones/cupones.types.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';

vi.mock('../../../../src/modules/cupones/cupones.repository.js', () => ({
  cuponesRepository: {
    listar: vi.fn(),
    obtener: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
    listarUsos: vi.fn(),
  },
}));

const repo = vi.mocked(cuponesRepository);
const INICIO = new Date('2026-01-01T06:00:00.000Z');
const FIN = new Date('2026-12-31T05:59:59.000Z');

const fila: FilaCupon = {
  IDCupon: 5,
  Codigo: 'PRUEBA10',
  Descripcion: null,
  TipoDescuento: 'PORCENTAJE',
  Valor: 10,
  IDCategoria: null,
  Categoria: null,
  MontoMinimo: 50,
  FechaInicio: INICIO,
  FechaFin: FIN,
  LimiteUsosTotal: 100,
  LimiteUsosPorCliente: 1,
  UsosActuales: 3,
  UsosDisponibles: 97,
  Activo: true,
  Vigente: true,
  Agotado: false,
  CantidadPedidos: 3,
  CantidadCarritos: 0,
  PuedeEliminarse: false,
};

const filaUso: FilaUsoCupon = {
  IDUsoCupon: 1,
  IDPedido: 9,
  NumeroPedido: 'SC-9',
  IDUsuario: 6,
  Cliente: 'Ana',
  Correo: 'a@x.gt',
  Descuento: 12.5,
  TotalPedido: 112.5,
  EstadoPedido: 'PAGADO',
  Fecha: INICIO,
};

const datos: DatosCupon = {
  codigo: 'PRUEBA10',
  descripcion: null,
  tipoDescuento: 'PORCENTAJE',
  valor: 10,
  idCategoria: null,
  montoMinimo: 50,
  fechaInicio: INICIO,
  fechaFin: FIN,
  limiteUsosTotal: 100,
  limiteUsosPorCliente: 1,
};

describe('cuponesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aCupon da montos con 2 decimales, fechas ISO UTC y booleanos', () => {
    // Act
    const cupon = aCupon({ ...fila, Activo: 1 as unknown as boolean });

    // Assert
    expect(cupon).toMatchObject({
      idCupon: 5,
      valor: '10.00',
      montoMinimo: '50.00',
      fechaInicio: '2026-01-01T06:00:00.000Z',
      activo: true,
      puedeEliminarse: false,
    });
  });

  it('aUso convierte descuento y total del pedido a string', () => {
    // Act
    const uso = aUso(filaUso);

    // Assert
    expect(uso).toMatchObject({ descuento: '12.50', totalPedido: '112.50', numeroPedido: 'SC-9' });
  });

  it('listar conserva page, pageSize y total y mapea los items', async () => {
    // Arrange
    repo.listar.mockResolvedValue({ items: [fila], page: 2, pageSize: 5, total: 11 });

    // Act
    const r = await cuponesService.listar(
      { activo: true },
      { page: 2, pageSize: 5, sort: 'codigo:asc' },
    );

    // Assert
    expect(repo.listar).toHaveBeenCalledWith(
      { activo: true },
      { page: 2, pageSize: 5, sort: 'codigo:asc' },
    );
    expect(r).toMatchObject({ page: 2, pageSize: 5, total: 11 });
    expect(r.items[0]?.codigo).toBe('PRUEBA10');
  });

  it('crear pasa el usuario y los datos tal cual al repositorio', async () => {
    // Arrange
    repo.crear.mockResolvedValue(fila);

    // Act
    const cupon = await cuponesService.crear(1, datos);

    // Assert
    expect(repo.crear).toHaveBeenCalledWith(1, datos);
    expect(cupon.idCupon).toBe(5);
  });

  it('cambiarEstado pasa el indicador activo al repositorio', async () => {
    // Arrange
    repo.cambiarEstado.mockResolvedValue({ ...fila, Activo: false });

    // Act
    const cupon = await cuponesService.cambiarEstado(1, 5, false);

    // Assert
    expect(repo.cambiarEstado).toHaveBeenCalledWith(1, 5, false);
    expect(cupon.activo).toBe(false);
  });

  it('eliminar propaga el 409 EN_USO del SP', async () => {
    // Arrange
    repo.eliminar.mockRejectedValue(new AppError('EN_USO', 'Tiene pedidos'));

    // Act & Assert
    await expect(cuponesService.eliminar(1, 5)).rejects.toMatchObject({ code: 'EN_USO' });
  });

  it('listarUsos mapea los usos y conserva la paginación', async () => {
    // Arrange
    repo.listarUsos.mockResolvedValue({ items: [filaUso], page: 1, pageSize: 20, total: 1 });

    // Act
    const r = await cuponesService.listarUsos(5, { page: 1, pageSize: 20, sort: 'fecha:desc' });

    // Assert
    expect(repo.listarUsos).toHaveBeenCalledWith(5, { page: 1, pageSize: 20, sort: 'fecha:desc' });
    expect(r.items[0]?.descuento).toBe('12.50');
    expect(r.total).toBe(1);
  });
});
