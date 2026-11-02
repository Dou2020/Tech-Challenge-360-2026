import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';
import { guestCart } from '../../../src/middlewares/guestCart.js';

const TOKEN_CARRITO = '2b1f0c8e-6a3d-4f0e-9c1a-7d5e8b2f4a10';

function crearApp(): Express {
  const app = express();
  app.get('/carrito', guestCart, (req, res) => {
    res.json({ tokenCarrito: req.tokenCarrito ?? null });
  });
  app.use(errorHandler);
  return app;
}

const app = crearApp();

describe('guestCart', () => {
  it('sin X-Cart-Token sigue sin token de carrito', async () => {
    const respuesta = await request(app).get('/carrito');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ tokenCarrito: null });
  });

  it('un header vacío cuenta como ausente', async () => {
    const respuesta = await request(app).get('/carrito').set('X-Cart-Token', '');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ tokenCarrito: null });
  });

  it('con un UUID lo deja en req.tokenCarrito en minúsculas', async () => {
    const respuesta = await request(app)
      .get('/carrito')
      .set('X-Cart-Token', TOKEN_CARRITO.toUpperCase());

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ tokenCarrito: TOKEN_CARRITO });
  });

  it.each([
    ['texto libre', 'mi-carrito'],
    ['UUID incompleto', '2b1f0c8e-6a3d-4f0e-9c1a'],
    ['UUID con llaves', `{${TOKEN_CARRITO}}`],
  ])('con %s responde 400 VALIDACION con el detalle del campo', async (_caso, valor) => {
    const respuesta = await request(app).get('/carrito').set('X-Cart-Token', valor);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    expect(respuesta.body.error.details).toEqual([
      { field: 'X-Cart-Token', message: expect.any(String) },
    ]);
  });

  it('rechaza el header repetido (Node une los valores con coma)', async () => {
    const respuesta = await request(app)
      .get('/carrito')
      .set('X-Cart-Token', `${TOKEN_CARRITO}, 1b4e28ba-2fa1-4d2e-883f-0016d3cca427`);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });
});
