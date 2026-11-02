import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../../src/middlewares/authenticate.js';
import { authorize } from '../../../src/middlewares/authorize.js';
import { errorHandler } from '../../../src/middlewares/errorHandler.js';
import { revocacionStore } from '../../../src/modules/auth/revocacion.store.js';
import { firmarAccessToken } from '../../../src/modules/auth/tokens.js';

vi.mock('../../../src/modules/auth/revocacion.store.js', () => ({
  revocacionStore: { estaRevocado: vi.fn() },
}));

const estaRevocado = vi.mocked(revocacionStore.estaRevocado);
const SID = '7b0c1f7e-2a54-4f11-9a0b-3a1c5d7e9f20';

function crearApp(): Express {
  const app = express();
  app.get('/admin', authenticate, authorize('Administrador'), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/personal', authenticate, authorize('Operador', 'Administrador'), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/sin-authenticate', authorize('Cliente'), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

const app = crearApp();

function token(rol: 'Cliente' | 'Operador' | 'Administrador' = 'Cliente'): string {
  return firmarAccessToken({ idUsuario: 12, rol, sid: SID }).accessToken;
}

beforeEach(() => {
  estaRevocado.mockReset();
  estaRevocado.mockResolvedValue(false);
});

describe('authorize', () => {
  it('permite el rol indicado', async () => {
    const respuesta = await request(app)
      .get('/admin')
      .set('Authorization', `Bearer ${token('Administrador')}`);

    expect(respuesta.status).toBe(200);
  });

  it('acepta cualquiera de varios roles', async () => {
    const respuesta = await request(app)
      .get('/personal')
      .set('Authorization', `Bearer ${token('Operador')}`);

    expect(respuesta.status).toBe(200);
  });

  it('un rol sin permiso responde 403 PROHIBIDO', async () => {
    const respuesta = await request(app)
      .get('/admin')
      .set('Authorization', `Bearer ${token('Cliente')}`);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.code).toBe('PROHIBIDO');
  });

  it('sin usuario autenticado responde 401, no 403', async () => {
    const respuesta = await request(app).get('/sin-authenticate');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
  });
});
