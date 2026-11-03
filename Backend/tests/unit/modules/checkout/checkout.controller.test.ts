import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkoutController } from '../../../../src/modules/checkout/checkout.controller.js';
import { checkoutService } from '../../../../src/modules/checkout/checkout.service.js';
import type { PedidoCreado } from '../../../../src/modules/checkout/checkout.types.js';

vi.mock('../../../../src/modules/checkout/checkout.service.js', () => ({
  checkoutService: { pagar: vi.fn() },
}));

const CLAVE = '6f1c1d3a-0b0e-4f7b-9d1a-1d2c3b4a5e6f';

const PEDIDO: PedidoCreado = {
  idPedido: 31,
  numeroPedido: 'SC-2026-000031',
  estado: 'PAGADO',
  total: '112.00',
  idTarjetaGuardada: null,
};

function entorno(datosPago: unknown) {
  const res = {
    locals: {
      validado: {
        body: { idDireccion: 3, idMetodoEnvio: 2, metodoPago: 'TARJETA', datosPago },
      },
    },
    location: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const req = { usuario: { idUsuario: 5, rol: 'Cliente' }, claveIdempotencia: CLAVE };
  return { req: req as unknown as Request, res: res as unknown as Response & typeof res };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkoutService.pagar).mockResolvedValue({ pedido: PEDIDO, creado: true });
});

const enviado = () => vi.mocked(checkoutService.pagar).mock.calls[0]![2];

describe('checkoutController.pagar: forma de datosPago', () => {
  it('{ idTarjeta } → solo idTarjeta; el resto null y guardar false', async () => {
    // Arrange
    const { req, res } = entorno({ idTarjeta: 9 });

    // Act
    await checkoutController.pagar(req, res);

    // Assert
    expect(checkoutService.pagar).toHaveBeenCalledWith(5, CLAVE, expect.any(Object));
    expect(enviado()).toEqual({
      idDireccion: 3,
      idMetodoEnvio: 2,
      metodoPago: 'TARJETA',
      idTarjeta: 9,
      titular: null,
      ultimos4: null,
      tipo: null,
      marca: null,
      guardar: false,
    });
  });

  it('{ titular, ultimos4 } → tipo y marca null, idTarjeta null y guardar false', async () => {
    // Arrange
    const { req, res } = entorno({ titular: 'Ana', ultimos4: '4242' });

    // Act
    await checkoutController.pagar(req, res);

    // Assert
    expect(enviado()).toMatchObject({
      idTarjeta: null,
      titular: 'Ana',
      ultimos4: '4242',
      tipo: null,
      marca: null,
      guardar: false,
    });
  });

  it('tarjeta nueva con tipo, marca y guardar → los reenvía', async () => {
    // Arrange
    const { req, res } = entorno({
      titular: 'Ana',
      ultimos4: '4242',
      tipo: 'DEBITO',
      marca: 'AMEX',
      guardar: true,
    });

    // Act
    await checkoutController.pagar(req, res);

    // Assert
    expect(enviado()).toMatchObject({
      idTarjeta: null,
      tipo: 'DEBITO',
      marca: 'AMEX',
      guardar: true,
    });
  });

  it('guardar: false explícito se mantiene en false', async () => {
    // Arrange
    const { req, res } = entorno({ titular: 'Ana', ultimos4: '4242', guardar: false });

    // Act
    await checkoutController.pagar(req, res);

    // Assert
    expect(enviado()).toMatchObject({ guardar: false });
  });
});

describe('checkoutController.pagar: respuesta', () => {
  it('pedido nuevo → 201 con Location', async () => {
    // Arrange
    const { req, res } = entorno({ titular: 'Ana', ultimos4: '4242' });

    // Act
    await checkoutController.pagar(req, res);

    // Assert
    expect(res.location).toHaveBeenCalledWith('/api/pedidos/31');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(PEDIDO);
  });

  it('repetición → 200', async () => {
    // Arrange
    vi.mocked(checkoutService.pagar).mockResolvedValue({ pedido: PEDIDO, creado: false });
    const { req, res } = entorno({ titular: 'Ana', ultimos4: '4242' });

    // Act
    await checkoutController.pagar(req, res);

    // Assert
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
