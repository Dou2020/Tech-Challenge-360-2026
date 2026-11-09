import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkoutRepository } from '../../../../src/modules/checkout/checkout.repository.js';
import {
  armarResumen,
  checkoutService,
  separarDetalleStock,
} from '../../../../src/modules/checkout/checkout.service.js';
import type { FilaResumenCheckout } from '../../../../src/modules/checkout/checkout.types.js';
import { cache } from '../../../../src/shared/cache/cache.js';
import { eventos } from '../../../../src/shared/eventos/eventos.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';

vi.mock('../../../../src/modules/checkout/checkout.repository.js', () => ({
  checkoutRepository: {
    reservar: vi.fn(),
    obtenerResumen: vi.fn(),
    liberarReserva: vi.fn(),
    crearPedido: vi.fn(),
  },
}));
vi.mock('../../../../src/shared/cache/cache.js', () => ({ cache: { invalidar: vi.fn() } }));
vi.mock('../../../../src/shared/eventos/eventos.js', () => ({ eventos: { publicar: vi.fn() } }));

const repo = vi.mocked(checkoutRepository);
const DATOS = {
  idDireccion: 5,
  idMetodoEnvio: 1,
  metodoPago: 'TARJETA' as const,
  idTarjeta: null,
  titular: 'Ana López',
  ultimos4: '4242',
  tipo: null,
  marca: null,
  guardar: false,
};
const CLAVE = '9a7c1e52-4b8d-4f3a-a2e6-0c5d7b9f1e34';

const encabezado: FilaResumenCheckout = {
  IDCarrito: 8,
  IDCupon: 1,
  CodigoCupon: 'BIENVENIDA10',
  DescripcionCupon: null,
  TipoDescuento: 'PORCENTAJE',
  ValorCupon: 10,
  CuponAplicado: false,
  CodigoErrorCupon: 50064,
  MensajeErrorCupon: 'Agotado',
  CantidadLineas: 1,
  CantidadUnidades: 2,
  Subtotal: 298,
  Descuento: 29.8,
  CostoEnvio: 25,
  Total: 293.2,
  PorcentajeIVA: 12,
  MontoIVA: 31.41,
  IDMetodoEnvio: 1,
  MetodoEnvio: 'Estándar',
  DiasEstimados: 3,
  ReservaVigente: true,
  ReservaExpiraEn: new Date('2026-11-03T15:45:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('separarDetalleStock', () => {
  it('separa el texto del JSON y arma un detalle por variante', () => {
    // Arrange
    const error = new AppError(
      'STOCK_INSUFICIENTE',
      'No hay existencia suficiente.\nDETALLE=[{"idVariante":4,"sku":"CAM-1","solicitado":2,"disponible":1}]',
    );

    // Act
    const resultado = separarDetalleStock(error) as AppError;

    // Assert
    expect(resultado.message).toBe('No hay existencia suficiente.');
    expect(resultado.status).toBe(409);
    expect(resultado.details).toEqual([
      { field: 'idVariante:4', message: 'CAM-1: solicitado 2, disponible 1.' },
    ]);
  });

  it('si el JSON no se puede leer deja solo el texto', () => {
    // Arrange
    const error = new AppError('STOCK_INSUFICIENTE', 'Sin stock.\nDETALLE=[{roto');

    // Act
    const resultado = separarDetalleStock(error) as AppError;

    // Assert
    expect(resultado.message).toBe('Sin stock.');
    expect(resultado.details).toBeUndefined();
  });

  it('no toca otros errores', () => {
    // Arrange
    const error = new AppError('NO_ENCONTRADO', 'x\nDETALLE=[]');

    // Act
    const resultado = separarDetalleStock(error);

    // Assert
    expect(resultado).toBe(error);
  });
});

describe('armarResumen', () => {
  it('da forma camelCase, montos como string y fecha ISO', () => {
    // Arrange
    const entrada = { encabezado, lineas: [] };

    // Act
    const resumen = armarResumen(entrada);

    // Assert
    expect(resumen).toMatchObject({
      idCarrito: 8,
      subtotal: '298.00',
      descuento: '29.80',
      costoEnvio: '25.00',
      total: '293.20',
      reservaVigente: true,
      reservaExpiraEn: '2026-11-03T15:45:00.000Z',
      metodoEnvio: { idMetodoEnvio: 1, nombre: 'Estándar', diasEstimados: 3 },
      cupon: { codigo: 'BIENVENIDA10', aplicado: false, codigoError: 'CUPON_AGOTADO' },
    });
  });
});

describe('checkoutService.iniciar', () => {
  it('traduce el DETALLE del 50030 a details', async () => {
    // Arrange
    repo.reservar.mockRejectedValue(
      new AppError(
        'STOCK_INSUFICIENTE',
        'Falta.\nDETALLE=[{"idVariante":1,"sku":"A","solicitado":3,"disponible":0}]',
      ),
    );

    // Act
    const accion = checkoutService.iniciar(1, { idDireccion: 5, idMetodoEnvio: 1 });

    // Assert
    await expect(accion).rejects.toMatchObject({
      code: 'STOCK_INSUFICIENTE',
      message: 'Falta.',
      details: [{ field: 'idVariante:1' }],
    });
  });
});

describe('checkoutService.pagar', () => {
  const fila = {
    IDPedido: 9,
    NumeroPedido: 'SC-9',
    Estado: 'PAGADO',
    Total: 293.2,
    IDTarjetaGuardada: 3,
  };

  it('pedido nuevo: creado e invalida la caché de reportes', async () => {
    // Arrange
    repo.crearPedido.mockResolvedValue({ ...fila, Repetido: false });

    // Act
    const resultado = await checkoutService.pagar(7, CLAVE, DATOS);

    // Assert
    expect(resultado).toEqual({
      creado: true,
      pedido: {
        idPedido: 9,
        numeroPedido: 'SC-9',
        estado: 'PAGADO',
        total: '293.20',
        idTarjetaGuardada: 3,
      },
    });
    expect(repo.crearPedido).toHaveBeenCalledWith(7, CLAVE, DATOS);
    expect(cache.invalidar).toHaveBeenCalledWith('reportes');
    expect(eventos.publicar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'CREADO', idPedido: 9, idUsuario: 7, estado: 'PAGADO' }),
    );
    expect(vi.mocked(cache.invalidar).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(eventos.publicar).mock.invocationCallOrder[0]!,
    );
  });

  it('repetición: no creado y no invalida la caché', async () => {
    // Arrange
    repo.crearPedido.mockResolvedValue({ ...fila, Repetido: true });

    // Act
    const resultado = await checkoutService.pagar(7, CLAVE, DATOS);

    // Assert
    expect(resultado.creado).toBe(false);
    expect(cache.invalidar).not.toHaveBeenCalled();
    expect(eventos.publicar).not.toHaveBeenCalled();
  });

  it('una repetición sin tarjeta devuelve idTarjetaGuardada null', async () => {
    // Arrange
    repo.crearPedido.mockResolvedValue({ ...fila, IDTarjetaGuardada: null, Repetido: true });

    // Act
    const resultado = await checkoutService.pagar(7, CLAVE, DATOS);

    // Assert
    expect(resultado.pedido.idTarjetaGuardada).toBeNull();
  });

  it('si el SP falla no invalida la caché', async () => {
    // Arrange
    repo.crearPedido.mockRejectedValue(new AppError('PAGO_RECHAZADO', 'Rechazado'));

    // Act
    const accion = checkoutService.pagar(7, CLAVE, DATOS);

    // Assert
    await expect(accion).rejects.toMatchObject({ code: 'PAGO_RECHAZADO' });
    expect(cache.invalidar).not.toHaveBeenCalled();
  });
});
