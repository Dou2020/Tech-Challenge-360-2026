import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { notFound } from '../../src/middlewares/notFound.js';
import { validate } from '../../src/middlewares/validate.js';
import { AppError } from '../../src/shared/errors/AppError.js';

function crearApp(configurar: (app: Express) => void): Express {
  const app = express();
  app.use(express.json());
  configurar(app);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('validate', () => {
  const app = crearApp((a) => {
    a.post(
      '/items/:id',
      validate({
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({ cantidad: z.number().int().positive() }),
      }),
      (_req, res) => {
        res.json(res.locals.validado);
      },
    );
  });

  it('deja pasar datos válidos y entrega los valores ya convertidos', async () => {
    const respuesta = await request(app).post('/items/7').send({ cantidad: 2 });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ params: { id: 7 }, body: { cantidad: 2 } });
  });

  it('responde 400 VALIDACION con el detalle de cada campo inválido', async () => {
    const respuesta = await request(app).post('/items/abc').send({ cantidad: 0 });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    expect(respuesta.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'id' }),
        expect.objectContaining({ field: 'cantidad' }),
      ]),
    );
  });
});

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

  it('responde 404 NO_ENCONTRADO para rutas inexistentes', async () => {
    const respuesta = await request(app).get('/no-existe');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });
});
