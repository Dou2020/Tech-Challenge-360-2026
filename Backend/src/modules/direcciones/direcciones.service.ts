import { direccionesRepository } from './direcciones.repository.js';
import type { DatosDireccion, Direccion, FilaDireccion } from './direcciones.types.js';

/*
 * El idUsuario siempre es el del token: una dirección ajena no se distingue de una inexistente
 * (el SP responde 50004 → 404). Sin caché: son pocas filas por cliente.
 */

export function aDireccion(fila: FilaDireccion): Direccion {
  return {
    idDireccion: fila.IDDireccion,
    alias: fila.Alias,
    nombreDestinatario: fila.NombreDestinatario,
    telefono: fila.Telefono,
    linea1: fila.Linea1,
    linea2: fila.Linea2,
    municipio: fila.Municipio,
    departamento: fila.Departamento,
    codigoPostal: fila.CodigoPostal,
    referencias: fila.Referencias,
  };
}

export const direccionesService = {
  async listar(idUsuario: number): Promise<Direccion[]> {
    return (await direccionesRepository.listar(idUsuario)).map(aDireccion);
  },

  async obtener(idUsuario: number, idDireccion: number): Promise<Direccion> {
    return aDireccion(await direccionesRepository.obtener(idUsuario, idDireccion));
  },

  async crear(idUsuario: number, datos: DatosDireccion): Promise<Direccion> {
    return aDireccion(await direccionesRepository.crear(idUsuario, datos));
  },

  async actualizar(
    idUsuario: number,
    idDireccion: number,
    datos: DatosDireccion,
  ): Promise<Direccion> {
    return aDireccion(await direccionesRepository.actualizar(idUsuario, idDireccion, datos));
  },

  async eliminar(idUsuario: number, idDireccion: number): Promise<void> {
    await direccionesRepository.desactivar(idUsuario, idDireccion);
  },
};
