import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';
import { notFound } from '../../../src/middlewares/notFound.js';

const app = express();
app.use(notFound);
app.use(errorHandler);

describe('notFound', () => {
  it('responde 404 NO_ENCONTRADO para rutas inexistentes', async () => {
    const respuesta = await request(app).get('/no-existe');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });
});
