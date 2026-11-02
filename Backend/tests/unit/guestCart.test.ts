import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateOpcional } from '../../src/middlewares/authenticate.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { guestCart } from '../../src/middlewares/guestCart.js';
import { revocacionStore } from '../../src/modules/auth/revocacion.store.js';
import { firmarAccessToken } from '../../src/modules/auth/tokens.js';
import { AppError } from '../../src/shared/errors/AppError.js';

vi.mock('../../src/modules/auth/revocacion.store.js', () => ({
  revocacionStore: { estaRevocado: vi.fn() },
}));

const estaRevocado = vi.mocked(revocacionStore.estaRevocado);
const SID = '7b0c1f7e-2a54-4f11-9a0b-3a1c5d7e9f20';
const TOKEN_CARRITO = '2b1f0c8e-6a3d-4f0e-9c1a-7d5e8b2f4a10';

function crearApp(): Express {
  const app = express();
  app.get('/carrito', guestCart, (req, res) => {
    res.json({ tokenCarrito: req.tokenCarrito ?? null });
  });
  // Cadena que usarán las rutas Invitado/Cliente del carrito.
  app.get('/carrito-completo', authenticateOpcional, guestCart, (req, res) => {
    res.json({ usuario: req.usuario ?? null, tokenCarrito: req.tokenCarrito ?? null });
  });
  app.use(errorHandler);
  return app;
}

const app = crearApp();

beforeEach(() => {
  estaRevocado.mockReset();
  estaRevocado.mockResolvedValue(false);
});

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

describe('authenticateOpcional', () => {
  function token(): string {
    return firmarAccessToken({ idUsuario: 12, rol: 'Cliente', sid: SID }).accessToken;
  }

  it('sin Authorization sigue como invitado y no consulta Redis', async () => {
    const respuesta = await request(app)
      .get('/carrito-completo')
      .set('X-Cart-Token', TOKEN_CARRITO);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ usuario: null, tokenCarrito: TOKEN_CARRITO });
    expect(estaRevocado).not.toHaveBeenCalled();
  });

  it('con un token válido deja req.usuario', async () => {
    const respuesta = await request(app)
      .get('/carrito-completo')
      .set('Authorization', `Bearer ${token()}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      usuario: { idUsuario: 12, rol: 'Cliente', sid: SID, jti: expect.any(String) },
      tokenCarrito: null,
    });
  });

  it('con un token inválido responde 401 y no degrada a invitado', async () => {
    const basura = await request(app)
      .get('/carrito-completo')
      .set('Authorization', 'Bearer abc.def.ghi')
      .set('X-Cart-Token', TOKEN_CARRITO);
    const basic = await request(app)
      .get('/carrito-completo')
      .set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(basura.status).toBe(401);
    expect(basura.body.error.code).toBe('NO_AUTENTICADO');
    expect(basic.status).toBe(401);
    expect(basic.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('con un token revocado responde 401 NO_AUTENTICADO', async () => {
    estaRevocado.mockResolvedValue(true);

    const respuesta = await request(app)
      .get('/carrito-completo')
      .set('Authorization', `Bearer ${token()}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('es fail-closed con token: si Redis no responde, 503 SERVICIO_NO_DISPONIBLE', async () => {
    estaRevocado.mockRejectedValue(new AppError('SERVICIO_NO_DISPONIBLE', 'Redis caído'));

    const respuesta = await request(app)
      .get('/carrito-completo')
      .set('Authorization', `Bearer ${token()}`);

    expect(respuesta.status).toBe(503);
    expect(respuesta.body.error.code).toBe('SERVICIO_NO_DISPONIBLE');
  });
});
