import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportesRepository } from '../../../../src/modules/reportes/reportes.repository.js';
import {
  aCarritoAbandonado,
  aRangoSp,
  aResumen,
  aVentaPeriodo,
  claveReporte,
  reportesService,
} from '../../../../src/modules/reportes/reportes.service.js';
import { cache } from '../../../../src/shared/cache/cache.js';

vi.mock('../../../../src/modules/reportes/reportes.repository.js', () => ({
  reportesRepository: {
    resumen: vi.fn(),
    ventasPorPeriodo: vi.fn(),
    ventasPorCategoria: vi.fn(),
    productosMasVendidos: vi.fn(),
    carritosAbandonados: vi.fn(),
  },
}));
vi.mock('../../../../src/shared/cache/cache.js', () => ({
  cache: { claveVersionada: vi.fn(), getOrSet: vi.fn() },
}));

const repo = vi.mocked(reportesRepository);
const cacheMock = vi.mocked(cache);

describe('claves de caché de reportes', () => {
  it('incluye endpoint, rango y parámetros extra en orden fijo', () => {
    // Arrange
    const rango = { desde: '2026-10-01', hasta: '2026-10-31' };

    // Act
    const clave = claveReporte('ventas', rango, 'semana');

    // Assert
    expect(clave).toBe('ventas:2026-10-01:2026-10-31:semana');
  });

  it('usa "-" para los límites ausentes y distingue filtros distintos', () => {
    // Arrange
    const sinRango = {};

    // Act
    const a = claveReporte('resumen', sinRango);
    const b = claveReporte('resumen', { desde: '2026-10-01' });

    // Assert
    expect(a).toBe('resumen:-:-');
    expect(b).not.toBe(a);
  });
});

describe('mapeos de reportes', () => {
  it('aRangoSp entrega medianoche UTC para el parámetro DATE, o null', () => {
    // Arrange
    const rango = { desde: '2026-10-05' };

    // Act
    const sp = aRangoSp(rango);

    // Assert
    expect(sp.desde?.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(sp.hasta).toBeNull();
  });

  it('el resumen formatea los montos con 2 decimales', () => {
    // Arrange
    const fila = {
      VentasNetas: 1515,
      Pedidos: 4,
      TicketPromedio: 378.75,
      UnidadesNetas: 14,
      EnvioCobrado: 120,
      CarritosAbandonados: 0,
    };

    // Act
    const resumen = aResumen(fila);

    // Assert
    expect(resumen).toMatchObject({
      ventasNetas: '1515.00',
      ticketPromedio: '378.75',
      envioCobrado: '120.00',
      pedidos: 4,
    });
  });

  it('periodoInicio sale como YYYY-MM-DD sin convertir de zona', () => {
    // Arrange
    const fila = {
      PeriodoInicio: new Date('2026-10-22T00:00:00.000Z'),
      Ventas: 378.5,
      Pedidos: 1,
      UnidadesNetas: 2,
    };

    // Act
    const venta = aVentaPeriodo(fila);

    // Assert
    expect(venta).toEqual({
      periodoInicio: '2026-10-22',
      ventas: '378.50',
      pedidos: 1,
      unidadesNetas: 2,
    });
  });

  it('el carrito de invitado conserva los nulos y las fechas salen en ISO', () => {
    // Arrange
    const fila = {
      IDCarrito: 9,
      IDUsuario: null,
      Tipo: 'INVITADO' as const,
      Cliente: null,
      Correo: null,
      CantidadLineas: 1,
      CantidadUnidades: 2,
      Subtotal: 200,
      Descuento: 0,
      Valor: 200,
      FechaCreacion: new Date('2026-10-01T10:00:00.000Z'),
      FechaUltimaActividad: new Date('2026-10-01T11:00:00.000Z'),
      HorasInactivo: 30,
    };

    // Act
    const carrito = aCarritoAbandonado(fila);

    // Assert
    expect(carrito).toMatchObject({
      idUsuario: null,
      cliente: null,
      valor: '200.00',
      fechaUltimaActividad: '2026-10-01T11:00:00.000Z',
    });
  });
});

describe('reportesService con caché', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheMock.claveVersionada.mockResolvedValue('shopcart:reportes:v3:x');
    cacheMock.getOrSet.mockImplementation(async (_clave, _ttl, cargar) => ({
      valor: await cargar(),
      hit: false,
    }));
  });

  it('usa la clave versionada del namespace reportes y el endpoint con sus filtros', async () => {
    // Arrange
    repo.ventasPorCategoria.mockResolvedValue([]);

    // Act
    await reportesService.ventasPorCategoria({ desde: '2026-10-01' });

    // Assert
    expect(cacheMock.claveVersionada).toHaveBeenCalledWith(
      'reportes',
      'ventas-por-categoria:2026-10-01:-',
    );
    expect(cacheMock.getOrSet).toHaveBeenCalledWith(
      'shopcart:reportes:v3:x',
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('los carritos abandonados paginan, convierten el total BIGINT y se cachean por página y orden', async () => {
    // Arrange
    repo.carritosAbandonados.mockResolvedValue({
      filas: [],
      resultSets: [[], [{ Total: '0' }]],
      returnValue: 0,
    });

    // Act
    const { valor } = await reportesService.carritosAbandonados(
      {},
      { page: 2, pageSize: 5, sort: 'valor:desc' },
    );

    // Assert
    expect(valor).toEqual({ items: [], page: 2, pageSize: 5, total: 0 });
    expect(cacheMock.claveVersionada).toHaveBeenCalledWith(
      'reportes',
      'carritos-abandonados:-:-:2:5:valor:desc',
    );
  });
});

describe('reportesService: resumen, ventas, categorías y productos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheMock.claveVersionada.mockResolvedValue('shopcart:reportes:v1:x');
    cacheMock.getOrSet.mockImplementation(async (_clave, _ttl, cargar) => ({
      valor: await cargar(),
      hit: false,
    }));
  });

  it('resumen: un SP sin filas es un error interno, no un resumen vacío', async () => {
    // Arrange
    repo.resumen.mockResolvedValue(undefined);

    // Act & Assert
    await expect(reportesService.resumen({})).rejects.toThrow(/no devolvió filas/);
  });

  it('ventas pasa la agrupación y el rango como DATE al SP y cachea por agrupación', async () => {
    // Arrange
    repo.ventasPorPeriodo.mockResolvedValue([
      {
        PeriodoInicio: new Date('2026-10-05T00:00:00.000Z'),
        Ventas: 10,
        Pedidos: 1,
        UnidadesNetas: 2,
      },
    ]);

    // Act
    const { valor } = await reportesService.ventas('semana', { desde: '2026-10-01' });

    // Assert
    expect(repo.ventasPorPeriodo).toHaveBeenCalledWith('semana', {
      desde: new Date('2026-10-01T00:00:00.000Z'),
      hasta: null,
    });
    expect(cacheMock.claveVersionada).toHaveBeenCalledWith(
      'reportes',
      'ventas:2026-10-01:-:semana',
    );
    expect(valor).toEqual([
      { periodoInicio: '2026-10-05', ventas: '10.00', pedidos: 1, unidadesNetas: 2 },
    ]);
  });

  it('ventasPorCategoria da todos los montos con 2 decimales', async () => {
    // Arrange
    repo.ventasPorCategoria.mockResolvedValue([
      {
        IDCategoria: 1,
        Categoria: 'Ropa',
        UnidadesVendidas: 5,
        UnidadesDevueltas: 1,
        UnidadesNetas: 4,
        VentaBruta: 500,
        MontoReembolsado: 100,
        VentaNeta: 400,
      },
    ]);

    // Act
    const { valor } = await reportesService.ventasPorCategoria({});

    // Assert
    expect(valor[0]).toMatchObject({
      ventaBruta: '500.00',
      montoReembolsado: '100.00',
      ventaNeta: '400.00',
      unidadesNetas: 4,
    });
  });

  it('productosMasVendidos pasa el límite al SP y lo incluye en la clave de caché', async () => {
    // Arrange
    repo.productosMasVendidos.mockResolvedValue([
      {
        IDProducto: 3,
        Producto: 'Camisa',
        IDCategoria: 1,
        Categoria: 'Ropa',
        UnidadesNetas: 7,
        VentaNeta: 350,
      },
    ]);

    // Act
    const { valor } = await reportesService.productosMasVendidos(5, {});

    // Assert
    expect(repo.productosMasVendidos).toHaveBeenCalledWith(5, { desde: null, hasta: null });
    expect(cacheMock.claveVersionada).toHaveBeenCalledWith(
      'reportes',
      'productos-mas-vendidos:-:-:5',
    );
    expect(valor[0]).toMatchObject({ producto: 'Camisa', ventaNeta: '350.00' });
  });
});
