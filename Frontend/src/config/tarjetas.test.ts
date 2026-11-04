import { describe, expect, it } from 'vitest';
import { crearTarjeta } from '../test/fixtures/tarjetas';
import {
  etiquetaTarjeta,
  etiquetasMarcaTarjeta,
  marcasTarjeta,
  resumenTarjeta,
  tiposTarjeta,
} from './tarjetas';

describe('resumenTarjeta', () => {
  it.each([
    [{ marca: 'VISA', tipo: 'CREDITO', ultimos4: '4242' }, 'VISA · Crédito •••• 4242'],
    [{ marca: 'MASTERCARD', tipo: 'DEBITO', ultimos4: '1111' }, 'Mastercard · Débito •••• 1111'],
    [{ marca: 'AMEX', tipo: 'CREDITO', ultimos4: '0005' }, 'American Express · Crédito •••• 0005'],
    [{ marca: 'OTRA', tipo: 'DEBITO', ultimos4: '9999' }, 'Otra · Débito •••• 9999'],
  ] as const)('%j → %s', (tarjeta, esperado) => {
    // Act
    const texto = resumenTarjeta(tarjeta);

    // Assert
    expect(texto).toBe(esperado);
  });
});

describe('etiquetaTarjeta', () => {
  it('agrega el titular al resumen', () => {
    // Act
    const texto = etiquetaTarjeta(crearTarjeta());

    // Assert
    expect(texto).toBe('VISA · Crédito •••• 4242 — Ana López');
  });
});

describe('catálogos de tarjeta', () => {
  it('las listas salen de las etiquetas, en el orden de la API', () => {
    // Assert
    expect(tiposTarjeta).toEqual(['CREDITO', 'DEBITO']);
    expect(marcasTarjeta).toEqual(['VISA', 'MASTERCARD', 'AMEX', 'OTRA']);
    expect(etiquetasMarcaTarjeta.AMEX).toBe('American Express');
  });
});
