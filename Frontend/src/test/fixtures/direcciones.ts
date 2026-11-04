import type { Direccion } from '../../types/direcciones';

export function crearDireccion(parcial: Partial<Direccion> = {}): Direccion {
  return {
    idDireccion: 5,
    alias: 'Casa',
    nombreDestinatario: 'Ana López',
    telefono: '5555-1234',
    linea1: '5a avenida 10-20',
    linea2: null,
    municipio: 'Mixco',
    departamento: 'Guatemala',
    codigoPostal: null,
    referencias: null,
    ...parcial,
  };
}
