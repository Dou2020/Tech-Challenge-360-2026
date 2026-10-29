import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';

const app = createApp();

beforeAll(async () => {
  await connectRedis();
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

describe('GET /api/health', () => {
  it('responde 200 con SQL Server (vía SP con el login de la aplicación) y Redis arriba', async () => {
    const respuesta = await request(app).get('/api/health');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ status: 'ok', sqlServer: 'up', redis: 'up' });
    expect(respuesta.headers['x-request-id']).toEqual(expect.any(String));
  });
});

describe('infraestructura HTTP', () => {
  it('una ruta inexistente responde 404 con el formato de error estándar', async () => {
    const respuesta = await request(app).get('/api/no-existe');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({
      error: { code: 'NO_ENCONTRADO', message: expect.any(String) },
      requestId: expect.any(String),
    });
  });

  it('respeta el X-Request-Id recibido', async () => {
    const respuesta = await request(app).get('/api/health').set('X-Request-Id', 'prueba-123');

    expect(respuesta.headers['x-request-id']).toBe('prueba-123');
  });

  it('sirve la documentación OpenAPI en /api/docs', async () => {
    const respuesta = await request(app).get('/api/docs/');

    expect(respuesta.status).toBe(200);
    expect(respuesta.text).toContain('swagger-ui');
  });
});
