import { describe, expect, it } from 'vitest';
import { formatearFecha, formatearMonto } from './format';

describe('formatearMonto', () => {
  it('formatea en quetzales con separador de miles y dos decimales', () => {
    expect(formatearMonto('1234.5')).toMatch(/^Q\s?1,234\.50$/);
    expect(formatearMonto(0)).toMatch(/^Q\s?0\.00$/);
  });
});

describe('formatearFecha', () => {
  it('muestra la hora de Guatemala (UTC-6), sin correrse de día', () => {
    // 03:30 UTC del 4 de noviembre = 21:30 del 3 de noviembre en Guatemala.
    const texto = formatearFecha('2026-11-04T03:30:00Z');

    expect(texto).toMatch(/^3\/11\/2026/);
    expect(texto).toMatch(/9:30\s?p/);
  });
});
