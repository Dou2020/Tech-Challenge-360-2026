import { describe, expect, it } from 'vitest';
import { iniciarBody, pagarBody } from '../../../../src/modules/checkout/checkout.schemas.js';

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

  it('acepta un retiro sin dirección con idSucursal', () => {
    // Arrange
    const retiro = { ...valido, idDireccion: undefined, idSucursal: 2 };

    // Act
    const resultado = pagarBody.safeParse(retiro);

    // Assert
    expect(resultado.success).toBe(true);
  });

  it.each([
    ['otro método de pago', { ...valido, metodoPago: 'EFECTIVO' }],
    ['últimos 4 con letras', { ...valido, datosPago: { titular: 'Ana', ultimos4: '42a2' } }],
    ['titular vacío', { ...valido, datosPago: { titular: ' ', ultimos4: '4242' } }],
    ['sin método de envío', { ...valido, idMetodoEnvio: undefined }],
    ['idSucursal inválido', { ...valido, idSucursal: 0 }],
  ])('rechaza %s', (_caso, cuerpo) => {
    // Act
    const resultado = pagarBody.safeParse(cuerpo);

    // Assert
    expect(resultado.success).toBe(false);
  });

  describe('datosPago', () => {
    const con = (datosPago: unknown) => pagarBody.safeParse({ ...valido, datosPago });

    it('acepta el pago con una tarjeta guardada', () => {
      // Act
      const resultado = con({ idTarjeta: 3 });

      // Assert
      expect(resultado.success).toBe(true);
      expect(resultado.data?.datosPago).toEqual({ idTarjeta: 3 });
    });

    it('acepta una tarjeta nueva para guardar con tipo y marca', () => {
      // Act
      const resultado = con({
        titular: 'Ana',
        ultimos4: '4242',
        tipo: 'CREDITO',
        marca: 'VISA',
        guardar: true,
      });

      // Assert
      expect(resultado.success).toBe(true);
    });

    it('guardar sin tipo ni marca falla en esos campos', () => {
      // Act
      const resultado = con({ titular: 'Ana', ultimos4: '4242', guardar: true });

      // Assert
      expect(resultado.success).toBe(false);
      expect(resultado.error?.issues.map((i) => i.path.join('.'))).toEqual([
        'datosPago.tipo',
        'datosPago.marca',
      ]);
    });

    it('guardar en false no exige tipo ni marca', () => {
      // Act
      const resultado = con({ titular: 'Ana', ultimos4: '4242', guardar: false });

      // Assert
      expect(resultado.success).toBe(true);
    });

    it.each([
      ['idTarjeta junto con guardar', { idTarjeta: 3, guardar: true }],
      ['idTarjeta junto con el titular', { idTarjeta: 3, titular: 'Ana', ultimos4: '4242' }],
      ['idTarjeta no positivo', { idTarjeta: 0 }],
      ['marca desconocida', { titular: 'Ana', ultimos4: '4242', tipo: 'DEBITO', marca: 'DINERS' }],
      ['tipo desconocido', { titular: 'Ana', ultimos4: '4242', tipo: 'PREPAGO', marca: 'VISA' }],
      ['sin datos', {}],
      ['no es un objeto', 'tarjeta'],
    ])('rechaza %s', (_caso, datosPago) => {
      // Act
      const resultado = con(datosPago);

      // Assert
      expect(resultado.success).toBe(false);
    });
  });
});

describe('iniciarBody', () => {
  it.each([
    ['a domicilio con idDireccion', { idMetodoEnvio: 1, idDireccion: 5 }],
    ['retiro con idSucursal', { idMetodoEnvio: 3, idSucursal: 2 }],
    ['sin dirección ni sucursal (lo decide el SP)', { idMetodoEnvio: 1 }],
    [
      'con idDireccion e idSucursal (el SP ignora el que sobra)',
      { idMetodoEnvio: 3, idDireccion: 5, idSucursal: 2 },
    ],
  ])('acepta %s', (_caso, cuerpo) => {
    // Act
    const resultado = iniciarBody.safeParse(cuerpo);

    // Assert
    expect(resultado.success).toBe(true);
    expect(resultado.data).toEqual(cuerpo);
  });

  it.each([
    ['sin método de envío', { idDireccion: 5 }],
    ['idSucursal en 0', { idMetodoEnvio: 3, idSucursal: 0 }],
    ['idSucursal no numérico', { idMetodoEnvio: 3, idSucursal: 'x' }],
    ['idDireccion negativo', { idMetodoEnvio: 1, idDireccion: -1 }],
  ])('rechaza %s', (_caso, cuerpo) => {
    // Act
    const resultado = iniciarBody.safeParse(cuerpo);

    // Assert
    expect(resultado.success).toBe(false);
  });
});
