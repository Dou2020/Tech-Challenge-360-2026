import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SolicitudPago } from '../../types/checkout';
import { request } from '../http';
import { checkoutApi } from './checkout';

vi.mock('../http', () => ({ request: vi.fn() }));
const pedir = vi.mocked(request);

describe('checkoutApi', () => {
  beforeEach(() => {
    pedir.mockReset();
  });

  it('iniciar → POST con idDireccion e idMetodoEnvio', async () => {
    // Act
    await checkoutApi.iniciar({ idDireccion: 5, idMetodoEnvio: 2 });

    // Assert
    expect(pedir).toHaveBeenCalledWith('/checkout/iniciar', {
      method: 'POST',
      body: { idDireccion: 5, idMetodoEnvio: 2 },
    });
  });

  it('obtenerResumen → GET con ?idMetodoEnvio=', async () => {
    // Act
    await checkoutApi.obtenerResumen(2);

    // Assert
    expect(pedir).toHaveBeenCalledWith('/checkout?idMetodoEnvio=2');
  });

  it('liberarReserva → DELETE /checkout/reserva', async () => {
    // Act
    await checkoutApi.liberarReserva();

    // Assert
    expect(pedir).toHaveBeenCalledWith('/checkout/reserva', { method: 'DELETE' });
  });

  it('pagar → envía la solicitud y la clave en el header Idempotency-Key', async () => {
    // Arrange
    const solicitud: SolicitudPago = {
      idDireccion: 5,
      idMetodoEnvio: 2,
      metodoPago: 'TARJETA',
      datosPago: { titular: 'Ana López', ultimos4: '4242' },
    };

    // Act
    await checkoutApi.pagar(solicitud, 'clave-abc');

    // Assert
    expect(pedir).toHaveBeenCalledWith('/checkout/pagar', {
      method: 'POST',
      body: solicitud,
      headers: { 'Idempotency-Key': 'clave-abc' },
    });
  });
});
