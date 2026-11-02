import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';
import { notFound } from '../../../src/middlewares/notFound.js';
import { AppError } from '../../../src/shared/errors/AppError.js';

function crearApp(configurar: (app: Express) => void): Express {
  const app = express();
  app.use(express.json());
  configurar(app);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  const app = crearApp((a) => {
    a.get('/negocio', () => {
      throw new AppError('CUPON_VENCIDO', 'El cupón VERANO25 venció el 30/09/2026.');
    });
    a.get('/inesperado', () => {
      throw new Error('detalle interno que no debe filtrarse');
    });
    a.post('/login', () => {
      throw new AppError('CUENTA_BLOQUEADA', 'Demasiados intentos.', undefined, {
        retryAfterSeg: 900,
      });
    });
  });

  it('convierte un AppError en su status y formato estándar', async () => {
    const respuesta = await request(app).get('/negocio');

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toEqual({
      error: { code: 'CUPON_VENCIDO', message: 'El cupón VERANO25 venció el 30/09/2026.' },
      requestId: expect.any(String),
    });
  });

  it('responde 500 ERROR_INTERNO sin exponer el detalle del error', async () => {
    const respuesta = await request(app).get('/inesperado');

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.error.code).toBe('ERROR_INTERNO');
    expect(JSON.stringify(respuesta.body)).not.toContain('detalle interno');
  });

  it('responde 400 si el body no es JSON válido', async () => {
    const respuesta = await request(app)
      .post('/cualquiera')
      .set('Content-Type', 'application/json')
      .send('{"mal formado"');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('responde 400 VALIDACION si el body supera el límite, no 500', async () => {
    const app = express();
    app.use(express.json({ limit: '10b' }));
    app.use(errorHandler);

    const respuesta = await request(app)
      .post('/cualquiera')
      .send({ texto: 'mucho más que diez bytes' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toEqual({
      code: 'VALIDACION',
      message: 'El cuerpo de la solicitud supera el tamaño permitido.',
    });
  });

  it('agrega Retry-After cuando el AppError lo indica', async () => {
    const respuesta = await request(app).post('/login');

    expect(respuesta.status).toBe(429);
    expect(respuesta.headers['retry-after']).toBe('900');
  });
});
