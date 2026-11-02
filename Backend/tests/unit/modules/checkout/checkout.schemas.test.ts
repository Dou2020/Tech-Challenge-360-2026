import { describe, expect, it } from 'vitest';
import { pagarBody } from '../../../../src/modules/checkout/checkout.schemas.js';

describe('pagarBody', () => {
  const valido = {
    idDireccion: 5,
    idMetodoEnvio: 1,
    metodoPago: 'TARJETA',
    datosPago: { titular: 'Ana', ultimos4: '4242' },
  };

  it('acepta el cuerpo completo', () => {
    // Act
    const resultado = pagarBody.safeParse(valido);

    // Assert
    expect(resultado.success).toBe(true);
  });

  it.each([
    ['otro método de pago', { ...valido, metodoPago: 'EFECTIVO' }],
    ['últimos 4 con letras', { ...valido, datosPago: { titular: 'Ana', ultimos4: '42a2' } }],
    ['titular vacío', { ...valido, datosPago: { titular: ' ', ultimos4: '4242' } }],
    ['sin dirección', { ...valido, idDireccion: undefined }],
  ])('rechaza %s', (_caso, cuerpo) => {
    // Act
    const resultado = pagarBody.safeParse(cuerpo);

    // Assert
    expect(resultado.success).toBe(false);
  });
});
