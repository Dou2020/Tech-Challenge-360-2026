import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis, redis } from '../../src/config/redis.js';
import { cache } from '../../src/shared/cache/cache.js';
import { USUARIOS_SEMILLA, clienteHttp, iniciarSesionComo, type Sesion } from '../helpers/auth.js';

/*
 * Redis detenido. En lugar de parar el contenedor (que cambiaría el puerto publicado y
 * afectaría a los demás archivos), se cierra el cliente de Redis de este worker: desde la
 * app es indistinguible de un Redis caído (isReady = false y los comandos fallan de inmediato,
 * porque el cliente no tiene cola offline). Al terminar se reconecta.
 *
 * Auth es fail-closed (503); la caché es fail-open (el catálogo público responde desde la base).
 */

const app = createApp();
let sesion: Sesion;
let sesionAdmin: Sesion;

beforeAll(async () => {
  await connectRedis();
  // La sesión se abre con Redis arriba; luego se "detiene" Redis.
  sesion = await iniciarSesionComo(app, 'cliente');
  sesionAdmin = await iniciarSesionComo(app, 'admin');
  await cache.invalidar('catalogo');
  // Calienta la caché del catálogo: con Redis arriba la segunda lectura es HIT.
  await request(app).get('/api/catalogo/categorias');
  await redis.close();
});

afterAll(async () => {
  await connectRedis();
  await Promise.all([closePool(), closeRedis()]);
});

describe('Redis detenido: rutas autenticadas (fail-closed)', () => {
  it.each([
    ['GET', '/api/auth/me'],
    ['GET', '/api/direcciones'],
    ['GET', '/api/carrito'],
  ])('%s %s con un access token válido → 503 SERVICIO_NO_DISPONIBLE', async (_metodo, ruta) => {
    // Arrange
    const http = clienteHttp(app, sesion);

    // Act
    const respuesta = await http.get(ruta);

    // Assert
    expect(respuesta.status).toBe(503);
    expect(respuesta.body.error.code).toBe('SERVICIO_NO_DISPONIBLE');
  });

  it.each([
    '/api/reportes/resumen',
    '/api/reportes/ventas-por-categoria',
    '/api/bitacora',
    '/api/configuracion',
  ])(
    'GET %s como Administrador → 503 SERVICIO_NO_DISPONIBLE (los reportes exigen sesión: no hay respuesta sin Redis)',
    async (ruta) => {
      // Arrange
      const http = clienteHttp(app, sesionAdmin);

      // Act
      const respuesta = await http.get(ruta);

      // Assert
      expect(respuesta.status).toBe(503);
      expect(respuesta.body.error.code).toBe('SERVICIO_NO_DISPONIBLE');
    },
  );

  it('login con credenciales correctas → 503 SERVICIO_NO_DISPONIBLE', async () => {
    // Arrange
    const credenciales = USUARIOS_SEMILLA.cliente;

    // Act
    const respuesta = await request(app).post('/api/auth/login').send(credenciales);

    // Assert
    expect(respuesta.status).toBe(503);
    expect(respuesta.body.error.code).toBe('SERVICIO_NO_DISPONIBLE');
  });

  it('refresh con una cookie → 503 SERVICIO_NO_DISPONIBLE', async () => {
    // Arrange
    const cookie = sesion.cookieRefresh;

    // Act
    const respuesta = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    // Assert
    expect(respuesta.status).toBe(503);
    expect(respuesta.body.error.code).toBe('SERVICIO_NO_DISPONIBLE');
  });
});

describe('Redis detenido: catálogo público sin caché (fail-open)', () => {
  it.each(['/api/catalogo/categorias', '/api/metodos-envio'])(
    'GET %s → 200 con datos de la base y X-Cache MISS',
    async (ruta) => {
      // Arrange: Redis ya está detenido (beforeAll)

      // Act
      const respuesta = await request(app).get(ruta);

      // Assert
      expect(respuesta.status).toBe(200);
      expect(respuesta.headers['x-cache']).toBe('MISS');
      expect(respuesta.body.length).toBeGreaterThan(0);
    },
  );

  it('dos lecturas seguidas nunca dan HIT mientras Redis está caído', async () => {
    // Arrange
    const leer = () => request(app).get('/api/catalogo/categorias');
    await leer();

    // Act
    const segunda = await leer();

    // Assert
    expect(segunda.status).toBe(200);
    expect(segunda.headers['x-cache']).toBe('MISS');
  });

  it('GET /api/health → 200 degradado con Redis down y SQL Server up', async () => {
    // Arrange: Redis ya está detenido (beforeAll)

    // Act
    const respuesta = await request(app).get('/api/health');

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ status: 'degradado', sqlServer: 'up', redis: 'down' });
  });
});

describe('Redis vuelve', () => {
  it('al reconectar, la misma sesión vuelve a autenticarse (200)', async () => {
    // Arrange
    await connectRedis();
    await esperarRedisListo();
    const http = clienteHttp(app, sesion);

    // Act
    const respuesta = await http.get('/api/auth/me');

    // Assert
    expect(respuesta.status).toBe(200);
  });
});

async function esperarRedisListo(): Promise<void> {
  const limite = Date.now() + 10_000;
  while (!redis.isReady && Date.now() < limite) {
    await new Promise((resolver) => setTimeout(resolver, 50));
  }
}
