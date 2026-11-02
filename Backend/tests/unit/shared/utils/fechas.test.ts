import { describe, expect, it } from 'vitest';
import { rangoFechas, rangoValido } from '../../../../src/shared/utils/fechas.js';

describe('rangoFechas', () => {
  it('toma YYYY-MM-DD como día de Guatemala y un instante tal cual', () => {
    expect(rangoFechas('2026-11-01', '2026-11-30')).toEqual({
      desde: new Date('2026-11-01T06:00:00.000Z'),
      hasta: new Date('2026-12-01T05:59:59.999Z'),
    });
    expect(rangoFechas(undefined, '2026-11-01T20:00:00Z')).toEqual({
      desde: null,
      hasta: new Date('2026-11-01T20:00:00.000Z'),
    });
  });

  it('el mismo día como desde y hasta es un rango válido', () => {
    expect(rangoValido('2026-11-01', '2026-11-01')).toBe(true);
    expect(rangoValido('2026-11-02', '2026-11-01')).toBe(false);
    expect(rangoValido(undefined, '2026-11-01')).toBe(true);
  });
});
