import { describe, expect, it } from 'vitest';
import { crearTarjeta } from '../test/fixtures/tarjetas';
import {
  OTRA_TARJETA,
  construirDatosPago,
  esquemaMarca,
  esquemaTipo,
  esquemaTitular,
  esquemaUltimos4,
  seleccionInicial,
  type ValoresPago,
} from './tarjetas';

const nueva: ValoresPago = {
  seleccion: OTRA_TARJETA,
  titular: 'Luis Pérez',
  ultimos4: '5555',
  tipo: '',
  marca: '',
  guardar: false,
};

describe('seleccionInicial', () => {
  it('con una predeterminada → elige su id aunque no sea la primera', () => {
    // Arrange
    const tarjetas = [
      crearTarjeta({ idTarjeta: 1, predeterminada: false }),
      crearTarjeta({ idTarjeta: 2, predeterminada: true }),
    ];

    // Act
    const seleccion = seleccionInicial(tarjetas);

    // Assert
    expect(seleccion).toBe('2');
  });

  it('sin predeterminada → elige la primera', () => {
    // Arrange
    const tarjetas = [
      crearTarjeta({ idTarjeta: 7, predeterminada: false }),
      crearTarjeta({ idTarjeta: 8, predeterminada: false }),
    ];

    // Act
    const seleccion = seleccionInicial(tarjetas);

    // Assert
    expect(seleccion).toBe('7');
  });

  it('sin tarjetas → elige "otra"', () => {
    // Act
    const seleccion = seleccionInicial([]);

    // Assert
    expect(seleccion).toBe(OTRA_TARJETA);
  });
});

describe('construirDatosPago', () => {
  it('tarjeta guardada → solo manda idTarjeta numérico', () => {
    // Act
    const datos = construirDatosPago({ ...nueva, seleccion: '3', titular: 'ignorado' });

    // Assert
    expect(datos).toEqual({ idTarjeta: 3 });
  });

  it('tarjeta nueva sin guardar ni tipo ni marca → solo titular y últimos 4', () => {
    // Act
    const datos = construirDatosPago(nueva);

    // Assert
    expect(datos).toEqual({ titular: 'Luis Pérez', ultimos4: '5555' });
  });

  it('tarjeta nueva con tipo y marca sin guardar → los envía sin guardar', () => {
    // Act
    const datos = construirDatosPago({ ...nueva, tipo: 'DEBITO', marca: 'AMEX' });

    // Assert
    expect(datos).toEqual({
      titular: 'Luis Pérez',
      ultimos4: '5555',
      tipo: 'DEBITO',
      marca: 'AMEX',
    });
  });

  it('tarjeta nueva para guardar → agrega guardar: true', () => {
    // Act
    const datos = construirDatosPago({ ...nueva, tipo: 'CREDITO', marca: 'VISA', guardar: true });

    // Assert
    expect(datos).toEqual({
      titular: 'Luis Pérez',
      ultimos4: '5555',
      tipo: 'CREDITO',
      marca: 'VISA',
      guardar: true,
    });
  });
});

describe('esquemas de tarjeta', () => {
  it('titular → recorta espacios y rechaza vacío o de más de 150 caracteres', () => {
    // Act & Assert
    expect(esquemaTitular.parse('  Ana  ')).toBe('Ana');
    expect(esquemaTitular.safeParse('   ').error?.issues[0]?.message).toBe(
      'Ingresa el nombre del titular.',
    );
    expect(esquemaTitular.safeParse('a'.repeat(151)).error?.issues[0]?.message).toBe(
      'Máximo 150 caracteres.',
    );
  });

  it.each(['', '123', '12345', 'abcd', '12a4'])('últimos 4 inválidos (%j) → rechaza', (valor) => {
    // Act
    const resultado = esquemaUltimos4.safeParse(valor);

    // Assert
    expect(resultado.error?.issues[0]?.message).toBe('Ingresa exactamente 4 dígitos.');
  });

  it('últimos 4 con 4 dígitos → acepta', () => {
    // Act & Assert
    expect(esquemaUltimos4.parse('0042')).toBe('0042');
  });

  it('guardar exige tipo y marca válidos → rechaza vacío y valores desconocidos', () => {
    // Act & Assert
    expect(esquemaTipo.safeParse('').error?.issues[0]?.message).toBe('Elige crédito o débito.');
    expect(esquemaTipo.safeParse('PREPAGO').success).toBe(false);
    expect(esquemaMarca.safeParse('').error?.issues[0]?.message).toBe(
      'Elige la marca de la tarjeta.',
    );
    expect(esquemaMarca.safeParse('DINERS').success).toBe(false);
    expect(esquemaTipo.parse('CREDITO')).toBe('CREDITO');
    expect(esquemaMarca.parse('OTRA')).toBe('OTRA');
  });
});
