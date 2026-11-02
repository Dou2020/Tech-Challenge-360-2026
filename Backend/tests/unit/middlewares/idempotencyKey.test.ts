import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';
import { idempotencyKey } from '../../../src/middlewares/idempotencyKey.js';

function crearApp(): Express {
  const app = express();
  app.use(express.json());
  app.post('/pagar', idempotencyKey, (req, res) => {
    res.json({ clave: req.claveIdempotencia });
  });
  app.use(errorHandler);
  return app;
}

const app = crearApp();
const CLAVE = '9a7c1e52-4b8d-4f3a-a2e6-0c5d7b9f1e34';

describe('idempotencyKey', () => {
  it('deja pasar un UUID v4 y lo expone en req.claveIdempotencia', async () => {
    const respuesta = await request(app).post('/pagar').set('Idempotency-Key', CLAVE).send({});

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ clave: CLAVE });
  });

  it('normaliza la clave a minúsculas', async () => {
    const respuesta = await request(app)
      .post('/pagar')
      .set('Idempotency-Key', CLAVE.toUpperCase())
      .send({});

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ clave: CLAVE });
  });

  it('acepta el nombre del header sin importar mayúsculas', async () => {
    const respuesta = await request(app).post('/pagar').set('idempotency-key', CLAVE).send({});

    expect(respuesta.status).toBe(200);
  });

  it('sin el header responde 400 IDEMPOTENCY_KEY_REQUERIDA', async () => {
    const respuesta = await request(app).post('/pagar').send({});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('IDEMPOTENCY_KEY_REQUERIDA');
    expect(respuesta.body.error.details).toBeUndefined();
  });

  it('un header vacío cuenta como ausente', async () => {
    const respuesta = await request(app).post('/pagar').set('Idempotency-Key', '').send({});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('IDEMPOTENCY_KEY_REQUERIDA');
  });

  it.each([
    ['texto libre', 'pago-1'],
    ['UUID v1', 'c232ab00-9414-11ec-b3c8-9f6bdeced846'],
    ['UUID v4 con variante inválida', '9a7c1e52-4b8d-4f3a-c2e6-0c5d7b9f1e34'],
    ['UUID sin guiones', '9a7c1e524b8d4f3aa2e60c5d7b9f1e34'],
    ['UUID nulo', '00000000-0000-0000-0000-000000000000'],
  ])('con %s responde 400 IDEMPOTENCY_KEY_REQUERIDA con el detalle', async (_caso, valor) => {
    const respuesta = await request(app).post('/pagar').set('Idempotency-Key', valor).send({});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('IDEMPOTENCY_KEY_REQUERIDA');
    expect(respuesta.body.error.details).toEqual([
      { field: 'Idempotency-Key', message: expect.any(String) },
    ]);
  });

  it('rechaza el header repetido (Node une los valores con coma)', async () => {
    const respuesta = await request(app)
      .post('/pagar')
      .set('Idempotency-Key', `${CLAVE}, 1b4e28ba-2fa1-4d2e-883f-0016d3cca427`)
      .send({});

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('IDEMPOTENCY_KEY_REQUERIDA');
  });
});
