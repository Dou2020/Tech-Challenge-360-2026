import { describe, expect, it } from 'vitest';
import { aMonto, aMontoOpcional, esquemaMonto } from '../../../../src/shared/utils/montos.js';

describe('montos', () => {
  it('formatea los DECIMAL de SQL Server con 2 decimales', () => {
    expect(aMonto(125.5)).toBe('125.50');
    expect(aMonto(0)).toBe('0.00');
    expect(aMonto(9999999999.99)).toBe('9999999999.99');
    expect(aMontoOpcional(null)).toBeNull();
    expect(aMontoOpcional(10)).toBe('10.00');
  });

  it('acepta montos de entrada con hasta 2 decimales y rechaza el resto', () => {
    expect(esquemaMonto.parse('149.00')).toBe(149);
    expect(esquemaMonto.parse('149.5')).toBe(149.5);
    for (const invalido of ['-1', '1.234', '12345678901', 'abc', '', '1e3']) {
      expect(esquemaMonto.safeParse(invalido).success).toBe(false);
    }
  });
});
