import { tarjetasRepository } from './tarjetas.repository.js';
import type { DatosTarjeta, FilaTarjeta, Tarjeta } from './tarjetas.types.js';

/*
 * El idUsuario siempre es el del token: una tarjeta ajena no se distingue de una inexistente
 * (el SP responde 50004 → 404). Sin caché: son pocas filas por cliente y cambian al pagar.
 */

export function aTarjeta(fila: FilaTarjeta): Tarjeta {
  return {
    idTarjeta: fila.IDTarjetaGuardada,
    titular: fila.Titular,
    ultimos4: fila.Ultimos4,
    tipo: fila.Tipo,
    marca: fila.Marca,
    predeterminada: Boolean(fila.Predeterminada),
    fechaCreacion: fila.FechaCreacion.toISOString(),
  };
}

export const tarjetasService = {
  async listar(idUsuario: number): Promise<Tarjeta[]> {
    return (await tarjetasRepository.listar(idUsuario)).map(aTarjeta);
  },

  async crear(idUsuario: number, datos: DatosTarjeta): Promise<Tarjeta> {
    return aTarjeta(await tarjetasRepository.crear(idUsuario, datos));
  },

  async marcarPredeterminada(idUsuario: number, idTarjeta: number): Promise<Tarjeta> {
    return aTarjeta(await tarjetasRepository.marcarPredeterminada(idUsuario, idTarjeta));
  },

  async eliminar(idUsuario: number, idTarjeta: number): Promise<void> {
    await tarjetasRepository.eliminar(idUsuario, idTarjeta);
  },
};
