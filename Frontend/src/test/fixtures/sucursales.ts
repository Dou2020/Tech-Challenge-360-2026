import type { SucursalGestion, SucursalPublica } from '../../types/sucursales';

export function crearSucursalPublica(parcial: Partial<SucursalPublica> = {}): SucursalPublica {
  return {
    idSucursal: 3,
    nombre: 'Zona 10',
    telefono: '22334455',
    linea1: '6a avenida 12-34',
    linea2: null,
    municipio: 'Guatemala',
    departamento: 'Guatemala',
    codigoPostal: null,
    horario: 'Lunes a viernes de 9:00 a 18:00',
    ...parcial,
  };
}

export function crearSucursalGestion(parcial: Partial<SucursalGestion> = {}): SucursalGestion {
  return {
    ...crearSucursalPublica(),
    activo: true,
    cantidadPedidos: 2,
    fechaCreacion: '2026-11-01T15:00:00.000Z',
    fechaModificacion: null,
    ...parcial,
  };
}
