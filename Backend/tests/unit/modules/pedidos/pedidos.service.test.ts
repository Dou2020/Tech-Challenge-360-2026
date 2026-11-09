import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pedidosRepository } from '../../../../src/modules/pedidos/pedidos.repository.js';
import { armarDetalle, pedidosService } from '../../../../src/modules/pedidos/pedidos.service.js';
import type { ResultadoDetallePedidoSp } from '../../../../src/modules/pedidos/pedidos.types.js';
import { cache } from '../../../../src/shared/cache/cache.js';
import { eventos } from '../../../../src/shared/eventos/eventos.js';

vi.mock('../../../../src/modules/pedidos/pedidos.repository.js', () => ({
  pedidosRepository: {
    listar: vi.fn(),
    listarTransiciones: vi.fn(),
    obtenerPorId: vi.fn(),
    obtenerHistorial: vi.fn(),
    listarDevoluciones: vi.fn(),
    cambiarEstado: vi.fn(),
    cancelar: vi.fn(),
    registrarDevolucion: vi.fn(),
  },
}));
vi.mock('../../../../src/shared/cache/cache.js', () => ({ cache: { invalidar: vi.fn() } }));
vi.mock('../../../../src/shared/eventos/eventos.js', () => ({ eventos: { publicar: vi.fn() } }));

const repo = vi.mocked(pedidosRepository);
const FECHA = new Date('2026-11-01T15:30:00.000Z');

const detalleSp: ResultadoDetallePedidoSp = {
  pedido: {
    IDPedido: 3,
    NumeroPedido: 'SC-3',
    IDUsuario: 6,
    Cliente: 'Ana López',
    CorreoCliente: 'a@x.gt',
    Estado: 'PAGADO',
    NombreEstado: 'Pagado',
    EsFinal: false,
    IDDireccion: 5,
    DireccionEntrega: 'Zona 1',
    IDMetodoEnvio: 1,
    MetodoEnvio: 'Estándar',
    DiasEstimados: 3,
    IDCupon: null,
    CodigoCupon: null,
    Subtotal: 200,
    Descuento: 0,
    CostoEnvio: 25,
    MontoIVA: 24.11,
    Total: 225,
    MontoReembolsado: 0,
    IDPago: 1,
    MetodoPago: 'TARJETA',
    MontoPago: 225,
    EstadoPago: 'APROBADO',
    ReferenciaTransaccion: 'SIM-AB',
    FechaPago: FECHA,
    FechaCreacion: FECHA,
  },
  lineas: [
    {
      IDPedidoDetalle: 10,
      IDVariante: 4,
      SKU: 'S1',
      NombreProducto: 'Camiseta',
      DescripcionVariante: 'M',
      Cantidad: 2,
      PrecioUnitario: 100,
      DescuentoLinea: 0,
      Subtotal: 200,
      CantidadDevuelta: 0,
      CantidadDevolvible: 0,
    },
  ],
  transiciones: [{ CodigoEstado: 'EN_PREPARACION', NombreEstado: 'En preparación', Via: 'ESTADO' }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('armarDetalle', () => {
  it('ensambla pedido, líneas congeladas y transiciones con montos string', () => {
    // Act
    const detalle = armarDetalle(detalleSp);

    // Assert
    expect(detalle).toMatchObject({
      idPedido: 3,
      total: '225.00',
      cupon: null,
      pago: { estado: 'APROBADO', monto: '225.00', fecha: '2026-11-01T15:30:00.000Z' },
      direccion: { idDireccion: 5, entrega: 'Zona 1' },
      lineas: [{ idPedidoDetalle: 10, precioUnitario: '100.00', subtotal: '200.00' }],
      transiciones: [{ estado: 'EN_PREPARACION', via: 'ESTADO' }],
    });
  });

  it('un retiro en sucursal trae la sucursal y la dirección en null', () => {
    // Arrange
    const retiro: ResultadoDetallePedidoSp = {
      ...detalleSp,
      pedido: {
        ...detalleSp.pedido,
        IDDireccion: null,
        DireccionEntrega: 'Recoger en Sucursal Zona 10: 6a. avenida',
        IDSucursal: 1,
        Sucursal: 'Sucursal Zona 10',
        RetiroEnSucursal: true,
      },
    };

    // Act
    const detalle = armarDetalle(retiro);

    // Assert
    expect(detalle).toMatchObject({
      retiroEnSucursal: true,
      sucursal: { idSucursal: 1, nombre: 'Sucursal Zona 10' },
      direccion: { idDireccion: null, entrega: 'Recoger en Sucursal Zona 10: 6a. avenida' },
    });
  });

  it('un envío a domicilio no es retiro y no tiene sucursal', () => {
    // Act
    const detalle = armarDetalle(detalleSp);

    // Assert
    expect(detalle).toMatchObject({ retiroEnSucursal: false, sucursal: null });
  });
});

describe('pedidosService', () => {
  it('listar: pasa el rango de fechas y devuelve la forma paginada', async () => {
    // Arrange
    repo.listar.mockResolvedValue({
      filas: [
        {
          IDPedido: 1,
          NumeroPedido: 'SC-1',
          IDUsuario: 6,
          Cliente: 'Ana',
          CorreoCliente: 'a@x.gt',
          Estado: 'PAGADO',
          NombreEstado: 'Pagado',
          Subtotal: 10,
          Descuento: 0,
          CostoEnvio: 5,
          Total: 15,
          CantidadLineas: 1,
          CantidadUnidades: 1,
          FechaCreacion: FECHA,
        },
      ],
      resultSets: [[], [{ Total: 7 }]],
      returnValue: 0,
    });

    // Act
    const r = await pedidosService.listar(
      6,
      { estado: 'PAGADO', desde: '2026-11-01' },
      { page: 1, pageSize: 20, sort: 'total:desc' },
    );

    // Assert
    expect(r).toMatchObject({ page: 1, pageSize: 20, total: 7 });
    expect(r.items[0]).toMatchObject({ idPedido: 1, total: '15.00', estado: 'PAGADO' });
    const filtros = repo.listar.mock.calls[0]![1];
    expect(filtros.estado).toBe('PAGADO');
    expect(filtros.desde?.toISOString()).toBe('2026-11-01T06:00:00.000Z');
    expect(filtros.hasta).toBeNull();
  });

  it.each([
    ['cancelar', 'CANCELADO', () => pedidosService.cancelar(6, 3, null)],
    ['cambiarEstado', 'ESTADO', () => pedidosService.cambiarEstado(2, 3, 'EN_PREPARACION', null)],
  ])('%s devuelve el detalle, invalida reportes y publica el evento', async (_n, tipo, accion) => {
    // Arrange
    repo.cancelar.mockResolvedValue(detalleSp);
    repo.cambiarEstado.mockResolvedValue(detalleSp);

    // Act
    const r = await accion();

    // Assert
    expect(r.idPedido).toBe(3);
    expect(cache.invalidar).toHaveBeenCalledWith('reportes');
    expect(eventos.publicar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo, idPedido: 3, estado: detalleSp.pedido.Estado }),
    );
    expect(vi.mocked(cache.invalidar).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(eventos.publicar).mock.invocationCallOrder[0]!,
    );
  });

  it('registrarDevolucion invalida reportes y da forma camelCase', async () => {
    // Arrange
    repo.registrarDevolucion.mockResolvedValue({
      IDDevolucion: 77,
      IDPedido: 3,
      Tipo: 'PARCIAL',
      MontoReembolso: 134.1,
      Motivo: 'Talla',
      EstadoPedido: 'DEVUELTO_PARCIAL',
      Fecha: FECHA,
    });

    // Act
    const r = await pedidosService.registrarDevolucion(2, 3, 'Talla', [
      { idPedidoDetalle: 10, cantidad: 1 },
    ]);

    // Assert
    expect(r).toMatchObject({
      idDevolucion: 77,
      montoReembolso: '134.10',
      estadoPedido: 'DEVUELTO_PARCIAL',
    });
    expect(cache.invalidar).toHaveBeenCalledWith('reportes');
    expect(eventos.publicar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'DEVOLUCION', estado: 'DEVUELTO_PARCIAL' }),
    );
  });

  it('si el SP falla (409) no invalida la caché', async () => {
    // Arrange
    repo.cancelar.mockRejectedValue(new Error('50040'));

    // Act
    const accion = pedidosService.cancelar(6, 3, null);

    // Assert
    await expect(accion).rejects.toThrow('50040');
    expect(cache.invalidar).not.toHaveBeenCalled();
    expect(eventos.publicar).not.toHaveBeenCalled();
  });

  it('listarDevoluciones agrupa las líneas por devolución', async () => {
    // Arrange
    repo.listarDevoluciones.mockResolvedValue({
      devoluciones: [
        {
          IDDevolucion: 1,
          IDPedido: 3,
          Tipo: 'PARCIAL',
          Motivo: 'm',
          MontoReembolso: 10,
          IDUsuario: 2,
          Usuario: 'Op',
          Fecha: FECHA,
        },
        {
          IDDevolucion: 2,
          IDPedido: 3,
          Tipo: 'TOTAL',
          Motivo: 'n',
          MontoReembolso: 5,
          IDUsuario: 2,
          Usuario: 'Op',
          Fecha: FECHA,
        },
      ],
      lineas: [
        {
          IDDevolucion: 2,
          IDDevolucionDetalle: 9,
          IDPedidoDetalle: 10,
          SKU: 'S1',
          NombreProducto: 'C',
          DescripcionVariante: null,
          Cantidad: 1,
          MontoReembolso: 5,
        },
      ],
    });

    // Act
    const r = await pedidosService.listarDevoluciones(2, 3);

    // Assert
    expect(r[0]!.lineas).toHaveLength(0);
    expect(r[1]!.lineas).toEqual([
      expect.objectContaining({ idPedidoDetalle: 10, montoReembolso: '5.00' }),
    ]);
  });
});

describe('pedidosService: catálogo de estados e historial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listarEstados convierte estados y transiciones, con la marca de permitida para el solicitante', async () => {
    // Arrange
    repo.listarTransiciones.mockResolvedValue({
      estados: [{ IDEstadoPedido: 1, Codigo: 'PAGADO', Nombre: 'Pagado', EsFinal: false }],
      transiciones: [
        {
          CodigoOrigen: 'PAGADO',
          CodigoDestino: 'CANCELADO',
          Rol: 'Cliente',
          PermitidaParaSolicitante: true,
          Via: 'CANCELAR',
        },
      ],
    });

    // Act
    const r = await pedidosService.listarEstados(6);

    // Assert
    expect(repo.listarTransiciones).toHaveBeenCalledWith(6);
    expect(r.estados).toEqual([{ codigo: 'PAGADO', nombre: 'Pagado', esFinal: false }]);
    expect(r.transiciones[0]).toEqual({
      origen: 'PAGADO',
      destino: 'CANCELADO',
      rol: 'Cliente',
      permitida: true,
      via: 'CANCELAR',
    });
  });

  it('historial deja el estado anterior en null en la fila de creación y da fechas ISO', async () => {
    // Arrange
    repo.obtenerHistorial.mockResolvedValue([
      {
        IDHistorialEstadoPedido: 1,
        IDPedido: 3,
        CodigoEstadoAnterior: null,
        EstadoAnterior: null,
        CodigoEstadoNuevo: 'PAGADO',
        EstadoNuevo: 'Pagado',
        IDUsuario: 6,
        Usuario: 'Ana',
        Comentario: null,
        Fecha: FECHA,
      },
      {
        IDHistorialEstadoPedido: 2,
        IDPedido: 3,
        CodigoEstadoAnterior: 'PAGADO',
        EstadoAnterior: 'Pagado',
        CodigoEstadoNuevo: 'EN_PREPARACION',
        EstadoNuevo: 'En preparación',
        IDUsuario: 2,
        Usuario: 'Operador',
        Comentario: 'ok',
        Fecha: FECHA,
      },
    ]);

    // Act
    const historial = await pedidosService.historial(2, 3);

    // Assert
    expect(repo.obtenerHistorial).toHaveBeenCalledWith(2, 3);
    expect(historial[0]?.estadoAnterior).toBeNull();
    expect(historial[1]?.estadoAnterior).toEqual({ codigo: 'PAGADO', nombre: 'Pagado' });
    expect(historial[1]?.fecha).toBe('2026-11-01T15:30:00.000Z');
  });
});
