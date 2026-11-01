import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../src/middlewares/authenticate.js';
import { authorize } from '../../src/middlewares/authorize.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { revocacionStore } from '../../src/modules/auth/revocacion.store.js';
import { AUDIENCIA_TOKEN, EMISOR_TOKEN, firmarAccessToken } from '../../src/modules/auth/tokens.js';
import { AppError } from '../../src/shared/errors/AppError.js';

vi.mock('../../src/modules/auth/revocacion.store.js', () => ({
  revocacionStore: { estaRevocado: vi.fn() },
}));

const estaRevocado = vi.mocked(revocacionStore.estaRevocado);
const SECRETO = process.env.JWT_ACCESS_SECRET!;
const SID = '7b0c1f7e-2a54-4f11-9a0b-3a1c5d7e9f20';

function crearApp(): Express {
  const app = express();
  app.get('/privado', authenticate, (req, res) => {
    res.json(req.usuario);
  });
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

describe('authenticate', () => {
  it('deja pasar un token válido y expone el usuario del token', async () => {
    const respuesta = await request(app).get('/privado').set('Authorization', `Bearer ${token()}`);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      idUsuario: 12,
      rol: 'Cliente',
      sid: SID,
      jti: expect.any(String),
    });
    expect(estaRevocado).toHaveBeenCalledWith(
      expect.objectContaining({ idUsuario: 12, sid: SID, iat: expect.any(Number) }),
    );
  });

  it('sin header Authorization responde 401 NO_AUTENTICADO', async () => {
    const respuesta = await request(app).get('/privado');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
    expect(estaRevocado).not.toHaveBeenCalled();
  });

  it('con un token mal formado o de otro esquema responde 401 NO_AUTENTICADO', async () => {
    const basura = await request(app).get('/privado').set('Authorization', 'Bearer abc.def.ghi');
    const basic = await request(app).get('/privado').set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(basura.status).toBe(401);
    expect(basura.body.error.code).toBe('NO_AUTENTICADO');
    expect(basic.status).toBe(401);
    expect(basic.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const ajeno = jwt.sign(
      { rol: 'Administrador', sid: SID },
      'otro-secreto-de-al-menos-32-caracteres!!',
      {
        subject: '1',
        jwtid: 'x',
        issuer: EMISOR_TOKEN,
        audience: AUDIENCIA_TOKEN,
        expiresIn: 60,
      },
    );

    const respuesta = await request(app).get('/privado').set('Authorization', `Bearer ${ajeno}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('rechaza un token sin los claims esperados (sin sid)', async () => {
    const incompleto = jwt.sign({ rol: 'Cliente' }, SECRETO, {
      subject: '12',
      jwtid: 'x',
      issuer: EMISOR_TOKEN,
      audience: AUDIENCIA_TOKEN,
      expiresIn: 60,
    });

    const respuesta = await request(app)
      .get('/privado')
      .set('Authorization', `Bearer ${incompleto}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('con un token vencido responde 401 TOKEN_EXPIRADO', async () => {
    const vencido = jwt.sign({ rol: 'Cliente', sid: SID }, SECRETO, {
      subject: '12',
      jwtid: 'x',
      issuer: EMISOR_TOKEN,
      audience: AUDIENCIA_TOKEN,
      expiresIn: -10,
    });

    const respuesta = await request(app).get('/privado').set('Authorization', `Bearer ${vencido}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('TOKEN_EXPIRADO');
  });

  it('un token revocado en Redis responde 401 aunque no haya vencido', async () => {
    estaRevocado.mockResolvedValue(true);

    const respuesta = await request(app).get('/privado').set('Authorization', `Bearer ${token()}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('es fail-closed: si Redis no responde, 503 SERVICIO_NO_DISPONIBLE', async () => {
    estaRevocado.mockRejectedValue(new AppError('SERVICIO_NO_DISPONIBLE', 'Redis caído'));

    const respuesta = await request(app).get('/privado').set('Authorization', `Bearer ${token()}`);

    expect(respuesta.status).toBe(503);
    expect(respuesta.body.error.code).toBe('SERVICIO_NO_DISPONIBLE');
  });
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
