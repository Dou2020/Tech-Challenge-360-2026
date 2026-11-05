import { describe, expect, it } from 'vitest';
import {
  diaDeGuatemala,
  formatearDia,
  guatemalaAIso,
  isoAGuatemala,
  rangoPorDefecto,
  restarDias,
} from './rangoFechas';

describe('rangoFechas', () => {
  it('el rango por defecto son los últimos 30 días en hora de Guatemala', () => {
    // Arrange: 04:00 UTC del 4 de noviembre es todavía el 3 de noviembre en Guatemala (UTC-6).
    const ahora = new Date('2026-11-04T04:00:00.000Z');

    // Act
    const rango = rangoPorDefecto(ahora);

    // Assert
    expect(rango).toEqual({ desde: '2026-10-05', hasta: '2026-11-03' });
  });

  it('resta días cruzando meses y formatea el día sin corrimiento de zona', () => {
    // Arrange / Act
    const resta = restarDias('2026-03-02', 3);

    // Assert
    expect(resta).toBe('2026-02-27');
    expect(formatearDia('2026-11-03')).toBe('03/11/2026');
  });

  it('diaDeGuatemala → usa el día de Guatemala (UTC-6), no el de UTC', () => {
    // Act & Assert
    expect(diaDeGuatemala(new Date('2026-11-04T05:59:00.000Z'))).toBe('2026-11-03');
    expect(diaDeGuatemala(new Date('2026-11-04T06:00:00.000Z'))).toBe('2026-11-04');
  });

  it('guatemalaAIso → la medianoche de Guatemala son las 06:00 UTC', () => {
    // Act & Assert
    expect(guatemalaAIso('2026-11-01T00:00')).toBe('2026-11-01T06:00:00.000Z');
    expect(guatemalaAIso('2026-12-31T20:30')).toBe('2027-01-01T02:30:00.000Z');
  });

  it('isoAGuatemala → convierte un instante UTC a la hora local de Guatemala', () => {
    // Act & Assert
    expect(isoAGuatemala('2026-11-01T06:00:00.000Z')).toBe('2026-11-01T00:00');
    expect(isoAGuatemala('2026-12-01T05:59:00.000Z')).toBe('2026-11-30T23:59');
  });

  it('guatemalaAIso e isoAGuatemala son inversas', () => {
    // Arrange
    const local = '2026-07-15T13:45';

    // Act & Assert
    expect(isoAGuatemala(guatemalaAIso(local))).toBe(local);
  });
});
