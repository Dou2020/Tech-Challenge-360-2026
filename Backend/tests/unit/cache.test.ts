import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearCache } from '../../src/shared/cache/cache.js';

/** Redis simulado en memoria con las operaciones que usa la caché. */
function crearRedisFalso() {
  const datos = new Map<string, string>();
  return {
    datos,
    get: vi.fn(async (clave: string) => datos.get(clave) ?? null),
    set: vi.fn(async (clave: string, valor: string) => {
      datos.set(clave, valor);
      return 'OK';
    }),
    incr: vi.fn(async (clave: string) => {
      const nuevo = Number(datos.get(clave) ?? 0) + 1;
      datos.set(clave, String(nuevo));
      return nuevo;
    }),
    del: vi.fn(async (claves: string[]) => {
      claves.forEach((clave) => datos.delete(clave));
      return claves.length;
    }),
  };
}

type ClienteFalso = ReturnType<typeof crearRedisFalso>;
const comoCliente = (falso: ClienteFalso) => falso as unknown as Parameters<typeof crearCache>[0];

describe('cache', () => {
  let redis: ClienteFalso;

  beforeEach(() => {
    redis = crearRedisFalso();
  });

  it('la primera lectura carga de la base (MISS) y la segunda sale de Redis (HIT)', async () => {
    const cache = crearCache(comoCliente(redis), true);
    const cargar = vi.fn(async () => ({ total: '1500.00' }));

    const primera = await cache.getOrSet('shopcart:prueba', 60, cargar);
    const segunda = await cache.getOrSet('shopcart:prueba', 60, cargar);

    expect(primera).toEqual({ valor: { total: '1500.00' }, hit: false });
    expect(segunda).toEqual({ valor: { total: '1500.00' }, hit: true });
    expect(cargar).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith('shopcart:prueba', '{"total":"1500.00"}', { EX: 60 });
  });

  it('invalidar cambia la versión del namespace y las claves nuevas ya no ven lo anterior', async () => {
    const cache = crearCache(comoCliente(redis), true);

    const antes = await cache.claveVersionada('reportes', 'ventas:abc');
    await cache.invalidar('reportes');
    const despues = await cache.claveVersionada('reportes', 'ventas:abc');

    expect(antes).toBe('shopcart:reportes:v0:ventas:abc');
    expect(despues).toBe('shopcart:reportes:v1:ventas:abc');
  });

  it('es fail-open: si Redis falla, devuelve el dato de la base', async () => {
    redis.get.mockRejectedValue(new Error('ECONNREFUSED'));
    redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const cache = crearCache(comoCliente(redis), true);

    const resultado = await cache.getOrSet('shopcart:prueba', 60, async () => 42);

    expect(resultado).toEqual({ valor: 42, hit: false });
  });

  it('desactivada, siempre carga de la base y no toca Redis', async () => {
    const cache = crearCache(comoCliente(redis), false);

    const resultado = await cache.getOrSet('shopcart:prueba', 60, async () => 'dato');

    expect(resultado).toEqual({ valor: 'dato', hit: false });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
