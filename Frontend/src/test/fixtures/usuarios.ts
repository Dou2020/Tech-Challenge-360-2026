import type { Usuario } from '../../types/auth';

/** Usuario Cliente de prueba; sobrescribe campos con `parcial`. */
export function crearCliente(parcial: Partial<Usuario> = {}): Usuario {
  return {
    idUsuario: 6,
    nombre: 'Ana',
    apellido: 'López',
    correo: 'cliente@shopcart.gt',
    rol: 'Cliente',
    ...parcial,
  };
}

export function crearOperador(parcial: Partial<Usuario> = {}): Usuario {
  return {
    idUsuario: 2,
    nombre: 'Omar',
    apellido: 'Pérez',
    correo: 'operador@shopcart.gt',
    rol: 'Operador',
    ...parcial,
  };
}

export function crearAdmin(parcial: Partial<Usuario> = {}): Usuario {
  return {
    idUsuario: 1,
    nombre: 'Alma',
    apellido: 'Ruiz',
    correo: 'admin@shopcart.gt',
    rol: 'Administrador',
    ...parcial,
  };
}
