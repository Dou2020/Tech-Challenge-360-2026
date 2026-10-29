import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { redis, type RedisClient } from '../../config/redis.js';
import { claves, type NamespaceCache } from './claves.js';

export interface ResultadoCache<T> {
  valor: T;
  /** true si vino de Redis (X-Cache: HIT). */
  hit: boolean;
}

/** Operaciones de Redis que usa la caché; permite simular el cliente en pruebas. */
type ClienteCache = Pick<RedisClient, 'get' | 'set' | 'incr' | 'del'>;

export function crearCache(cliente: ClienteCache, habilitada: boolean) {
  /**
   * Cache-aside: devuelve el valor de Redis o lo carga con `cargar` y lo guarda.
   * Fail-open: si Redis falla, registra el error y devuelve el valor de la base.
   */
  async function getOrSet<T>(
    clave: string,
    ttlSegundos: number,
    cargar: () => Promise<T>,
  ): Promise<ResultadoCache<T>> {
    if (!habilitada) return { valor: await cargar(), hit: false };

    try {
      const guardado = await cliente.get(clave);
      if (guardado !== null) return { valor: JSON.parse(guardado) as T, hit: true };
    } catch (error) {
      logger.warn({ err: error, clave }, 'Caché no disponible al leer');
    }

    const valor = await cargar();
    try {
      await cliente.set(clave, JSON.stringify(valor), { EX: ttlSegundos });
    } catch (error) {
      logger.warn({ err: error, clave }, 'Caché no disponible al escribir');
    }
    return { valor, hit: false };
  }

  /** Clave dentro de un namespace versionado: shopcart:<ns>:v<n>:<resto>. */
  async function claveVersionada(namespace: NamespaceCache, resto: string): Promise<string> {
    let version = 0;
    try {
      version = Number((await cliente.get(claves.version(namespace))) ?? 0);
    } catch (error) {
      logger.warn({ err: error, namespace }, 'Caché no disponible al leer la versión');
    }
    return claves.versionada(namespace, version, resto);
  }

  /**
   * Invalida todo un namespace incrementando su versión: las claves anteriores
   * dejan de leerse y expiran por su TTL. Llamar después de confirmar la transacción.
   */
  async function invalidar(namespace: NamespaceCache): Promise<void> {
    try {
      await cliente.incr(claves.version(namespace));
    } catch (error) {
      logger.error({ err: error, namespace }, 'No se pudo invalidar la caché');
    }
  }

  /** Borra claves puntuales (usuario, configuración). */
  async function borrar(...clavesABorrar: string[]): Promise<void> {
    try {
      await cliente.del(clavesABorrar);
    } catch (error) {
      logger.error({ err: error, claves: clavesABorrar }, 'No se pudo borrar de la caché');
    }
  }

  return { getOrSet, claveVersionada, invalidar, borrar };
}

export const cache = crearCache(redis, env.CACHE_ENABLED);
