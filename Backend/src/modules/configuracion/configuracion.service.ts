import { cache, type ResultadoCache } from '../../shared/cache/cache.js';
import { claves } from '../../shared/cache/claves.js';
import { configuracionRepository } from './configuracion.repository.js';
import type { FilaConfiguracion, Parametro } from './configuracion.types.js';

/** Vida de la caché shopcart:configuracion (README → Redis: 1 h). */
const TTL_CACHE_CONFIGURACION_SEG = 3600;

function aParametro(fila: FilaConfiguracion): Parametro {
  return {
    idConfiguracion: fila.IDConfiguracion,
    clave: fila.Clave,
    valor: fila.Valor,
    descripcion: fila.Descripcion,
  };
}

export const configuracionService = {
  /** Cache-aside. Solo se cachea esta lectura de administración: los SPs leen la tabla directo. */
  listar(): Promise<ResultadoCache<Parametro[]>> {
    return cache.getOrSet(claves.configuracion(), TTL_CACHE_CONFIGURACION_SEG, async () =>
      (await configuracionRepository.listar()).map(aParametro),
    );
  },

  async actualizar(idUsuario: number, clave: string, valor: string): Promise<Parametro> {
    const fila = await configuracionRepository.actualizar(idUsuario, clave, valor);
    // Después de que el SP confirmó.
    await cache.borrar(claves.configuracion());
    // Los reportes leen parámetros (p. ej. HorasCarritoAbandonado). Siempre, sin comparar el valor.
    await cache.invalidar('reportes');
    return aParametro(fila);
  },
};
