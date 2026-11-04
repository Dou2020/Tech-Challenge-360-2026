import type { Tarjeta } from '../../types/tarjetas';

export function crearTarjeta(parcial: Partial<Tarjeta> = {}): Tarjeta {
  return {
    idTarjeta: 3,
    titular: 'Ana López',
    ultimos4: '4242',
    tipo: 'CREDITO',
    marca: 'VISA',
    predeterminada: true,
    fechaCreacion: '2026-11-02T15:30:00.000Z',
    ...parcial,
  };
}
