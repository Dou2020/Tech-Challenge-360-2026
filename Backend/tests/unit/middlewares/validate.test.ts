import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';
import { notFound } from '../../../src/middlewares/notFound.js';
import { validate } from '../../../src/middlewares/validate.js';

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
