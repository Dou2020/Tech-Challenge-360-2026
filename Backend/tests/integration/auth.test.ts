import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { closeRedis, connectRedis, redis } from '../../src/config/redis.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { crearLimitador } from '../../src/middlewares/rateLimit.js';
import { AUDIENCIA_TOKEN, EMISOR_TOKEN } from '../../src/modules/auth/tokens.js';
import { claves } from '../../src/shared/cache/claves.js';
import {
  USUARIOS_SEMILLA,
  bandeja,
  clienteHttp,
  cookieRefresh,
  correosPara,
  correoUnico,
  iniciarSesion,
  iniciarSesionComo,
  registrarCliente,
  tokenDelUltimoCorreo,
} from '../helpers/auth.js';

const app = createApp();

beforeAll(async () => {
  await connectRedis();
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

describe('POST /api/auth/login', () => {
  it('con credenciales válidas devuelve el access token, el usuario y la cookie de refresh', async () => {
    const respuesta = await request(app).post('/api/auth/login').send(USUARIOS_SEMILLA.cliente);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      accessToken: expect.any(String),
      expiraEn: 900,
      usuario: {
        idUsuario: expect.any(Number),
        nombre: expect.any(String),
        apellido: expect.any(String),
        correo: 'cliente@shopcart.gt',
        rol: 'Cliente',
      },
    });
    const setCookie = (respuesta.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('refreshToken='),
    );
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\/api\/auth/);
    expect(setCookie).toMatch(/Max-Age=604800/);
  });

  it('emite el rol correcto para Operador y Administrador', async () => {
    const operador = await iniciarSesionComo(app, 'operador');
    const admin = await iniciarSesionComo(app, 'admin');

    expect(operador.usuario.rol).toBe('Operador');
    expect(admin.usuario.rol).toBe('Administrador');
  });

  it('normaliza el correo: mayúsculas y espacios no impiden el login', async () => {
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ correo: '  CLIENTE@ShopCart.gt ', contrasena: 'Cliente#2026' });

    expect(respuesta.status).toBe(200);
  });

  it('con contraseña incorrecta responde 401 CREDENCIALES_INVALIDAS sin cookie', async () => {
    const { credenciales } = await registrarCliente(app);

    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ correo: credenciales.correo, contrasena: 'Incorrecta#1' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('CREDENCIALES_INVALIDAS');
    expect(cookieRefresh(respuesta)).toBeUndefined();
  });

  it('un correo inexistente recibe el mismo 401 y el mismo mensaje', async () => {
    const { credenciales } = await registrarCliente(app);
    const existente = await request(app)
      .post('/api/auth/login')
      .send({ correo: credenciales.correo, contrasena: 'Incorrecta#1' });

    const inexistente = await request(app)
      .post('/api/auth/login')
      .send({ correo: correoUnico('nadie'), contrasena: 'Incorrecta#1' });

    expect(inexistente.status).toBe(401);
    expect(inexistente.body.error).toEqual(existente.body.error);
  });

  it('un usuario inactivo con la contraseña correcta recibe 403 USUARIO_INACTIVO', async () => {
    const respuesta = await request(app).post('/api/auth/login').send(USUARIOS_SEMILLA.inactivo);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.code).toBe('USUARIO_INACTIVO');
    expect(cookieRefresh(respuesta)).toBeUndefined();
  });

  it('un usuario inactivo con la contraseña incorrecta recibe 401: no se revela su estado', async () => {
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ correo: USUARIOS_SEMILLA.inactivo.correo, contrasena: 'Incorrecta#1' });

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('CREDENCIALES_INVALIDAS');
    await redis.del(claves.intentosLogin(USUARIOS_SEMILLA.inactivo.correo));
  });

  it('un body inválido responde 400 VALIDACION', async () => {
    const respuesta = await request(app).post('/api/auth/login').send({ correo: 'no-es-correo' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it(`tras ${env.LOGIN_MAX_INTENTOS} fallos el siguiente login responde 429 CUENTA_BLOQUEADA aun con la contraseña correcta`, async () => {
    const { credenciales } = await registrarCliente(app);
    const fallar = () =>
      request(app)
        .post('/api/auth/login')
        .send({ correo: credenciales.correo, contrasena: 'Incorrecta#1' });

    for (let intento = 1; intento < env.LOGIN_MAX_INTENTOS; intento++) {
      expect((await fallar()).status).toBe(401);
    }
    const quinto = await fallar();
    expect(quinto.status).toBe(429);
    expect(quinto.body.error.code).toBe('CUENTA_BLOQUEADA');

    const sexto = await request(app).post('/api/auth/login').send(credenciales);

    expect(sexto.status).toBe(429);
    expect(sexto.body.error.code).toBe('CUENTA_BLOQUEADA');
    const retryAfter = Number(sexto.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(env.LOGIN_BLOQUEO_MIN * 60 - 30);
    expect(retryAfter).toBeLessThanOrEqual(env.LOGIN_BLOQUEO_MIN * 60);
  });

  it('un login correcto reinicia el contador de fallos', async () => {
    const { credenciales } = await registrarCliente(app);
    const fallar = () =>
      request(app)
        .post('/api/auth/login')
        .send({ correo: credenciales.correo, contrasena: 'Incorrecta#1' });

    for (let intento = 1; intento < env.LOGIN_MAX_INTENTOS; intento++) await fallar();
    await iniciarSesion(app, credenciales);

    expect((await fallar()).status).toBe(401);
  });
});

describe('POST /api/auth/registro', () => {
  it('con un correo nuevo responde 202 sin sesión y manda la bienvenida con el enlace', async () => {
    // Arrange
    const correo = correoUnico();

    // Act
    const respuesta = await request(app).post('/api/auth/registro').send({
      correo,
      nombre: 'Lucía',
      apellido: 'Pérez',
      telefono: '5555-1234',
    });

    // Assert
    expect(respuesta.status).toBe(202);
    expect(respuesta.body).toEqual({ mensaje: expect.any(String) });
    expect(cookieRefresh(respuesta)).toBeUndefined();
    const [mensaje] = correosPara(correo);
    expect(mensaje?.asunto).toMatch(/Bienvenido/);
    expect(mensaje?.texto).toContain(`${env.APP_URL_PUBLICA}/crear-contrasena#token=`);
  });

  it('el usuario registrado inicia sesión una vez que crea su contraseña', async () => {
    // Arrange
    const { credenciales, usuario } = await registrarCliente(app, { telefono: null });

    // Act
    const sesion = await iniciarSesion(app, credenciales);

    // Assert
    expect(sesion.usuario.idUsuario).toBe(usuario.idUsuario);
  });

  it('un correo ya registrado (sin importar mayúsculas) responde 202 con el mismo cuerpo y avisa "ya tienes cuenta"', async () => {
    // Arrange
    const { credenciales } = await registrarCliente(app);
    const nuevo = await request(app)
      .post('/api/auth/registro')
      .send({ correo: correoUnico(), nombre: 'Otra', apellido: 'Persona' });
    bandeja().vaciarBandeja();

    // Act
    const respuesta = await request(app)
      .post('/api/auth/registro')
      .send({ correo: credenciales.correo.toUpperCase(), nombre: 'Otra', apellido: 'Persona' });

    // Assert
    expect(respuesta.status).toBe(202);
    expect(respuesta.body).toEqual(nuevo.body);
    const [mensaje] = correosPara(credenciales.correo);
    expect(mensaje?.asunto).toMatch(/Ya tienes una cuenta/);
    expect(mensaje?.texto).toContain(`${env.APP_URL_PUBLICA}/recuperar-contrasena`);
    expect(mensaje?.texto).not.toContain('#token=');
  });

  it('un correo que sigue sin contraseña recibe un enlace nuevo y el anterior deja de servir', async () => {
    // Arrange
    const correo = correoUnico();
    const registro = { correo, nombre: 'Ana', apellido: 'López' };
    await request(app).post('/api/auth/registro').send(registro);
    const tokenViejo = tokenDelUltimoCorreo(correo);

    // Act
    const respuesta = await request(app).post('/api/auth/registro').send(registro);

    // Assert
    expect(respuesta.status).toBe(202);
    expect(correosPara(correo)).toHaveLength(2);
    expect(tokenDelUltimoCorreo(correo)).not.toBe(tokenViejo);
    const viejo = await request(app)
      .post('/api/auth/contrasena/verificar')
      .send({ token: tokenViejo });
    expect(viejo.status).toBe(400);
  });

  it('un usuario desactivado responde 202 y no recibe correo', async () => {
    // Arrange
    bandeja().vaciarBandeja();

    // Act
    const respuesta = await request(app)
      .post('/api/auth/registro')
      .send({ correo: USUARIOS_SEMILLA.inactivo.correo, nombre: 'X', apellido: 'Y' });

    // Assert
    expect(respuesta.status).toBe(202);
    expect(correosPara(USUARIOS_SEMILLA.inactivo.correo)).toHaveLength(0);
  });

  it('mientras la contraseña está pendiente el login responde 401 CREDENCIALES_INVALIDAS', async () => {
    // Arrange
    const correo = correoUnico();
    await request(app)
      .post('/api/auth/registro')
      .send({ correo, nombre: 'Ana', apellido: 'López' });

    // Act
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ correo, contrasena: 'Prueba#2026' });

    // Assert
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('CREDENCIALES_INVALIDAS');
  });

  it('ya no acepta contraseña en el registro: el campo se ignora', async () => {
    // Arrange
    const correo = correoUnico();

    // Act
    const respuesta = await request(app)
      .post('/api/auth/registro')
      .send({ correo, contrasena: 'Prueba#2026', nombre: 'Ana', apellido: 'López' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ correo, contrasena: 'Prueba#2026' });

    // Assert
    expect(respuesta.status).toBe(202);
    expect(login.status).toBe(401);
  });

  it('sin nombre responde 400 VALIDACION con el campo', async () => {
    // Act
    const respuesta = await request(app)
      .post('/api/auth/registro')
      .send({ correo: correoUnico(), apellido: 'López' });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'nombre' })]),
    );
  });
});

describe('GET /api/auth/me', () => {
  it('devuelve el usuario de la sesión; la segunda lectura sale de la caché', async () => {
    const sesion = await registrarCliente(app);
    const http = clienteHttp(app, sesion);

    const primera = await http.get('/api/auth/me');
    const segunda = await http.get('/api/auth/me');

    expect(primera.status).toBe(200);
    expect(primera.body).toEqual(sesion.usuario);
    expect(primera.headers['x-cache']).toBe('MISS');
    expect(segunda.headers['x-cache']).toBe('HIT');
  });

  it('sin token responde 401 NO_AUTENTICADO', async () => {
    const respuesta = await request(app).get('/api/auth/me');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('con un access token vencido responde 401 TOKEN_EXPIRADO', async () => {
    const sesion = await iniciarSesionComo(app, 'cliente');
    const { sid } = jwt.decode(sesion.accessToken) as { sid: string };
    const vencido = jwt.sign({ rol: 'Cliente', sid }, env.JWT_ACCESS_SECRET, {
      subject: String(sesion.usuario.idUsuario),
      jwtid: randomUUID(),
      issuer: EMISOR_TOKEN,
      audience: AUDIENCIA_TOKEN,
      expiresIn: -60,
    });

    const respuesta = await clienteHttp(app, vencido).get('/api/auth/me');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('TOKEN_EXPIRADO');
  });

  it('con un token alterado responde 401 NO_AUTENTICADO', async () => {
    const sesion = await iniciarSesionComo(app, 'cliente');

    const respuesta = await clienteHttp(app, `${sesion.accessToken}x`).get('/api/auth/me');

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
  });
});

describe('POST /api/auth/refresh', () => {
  const refrescar = (cookie?: string) => {
    const prueba = request(app).post('/api/auth/refresh');
    return cookie ? prueba.set('Cookie', cookie) : prueba;
  };

  it('rota el refresh token y entrega un access token nuevo que funciona', async () => {
    const sesion = await registrarCliente(app);

    const respuesta = await refrescar(sesion.cookieRefresh);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ accessToken: expect.any(String), expiraEn: 900 });
    const nueva = cookieRefresh(respuesta);
    expect(nueva).toBeDefined();
    expect(nueva).not.toBe(sesion.cookieRefresh);
    expect((await clienteHttp(app, respuesta.body.accessToken).get('/api/auth/me')).status).toBe(
      200,
    );
  });

  it('sin cookie responde 401 REFRESH_INVALIDO', async () => {
    const respuesta = await refrescar();

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('REFRESH_INVALIDO');
  });

  it('con una cookie inventada responde 401 REFRESH_INVALIDO', async () => {
    const respuesta = await refrescar(`refreshToken=${randomUUID()}.${'a'.repeat(43)}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('REFRESH_INVALIDO');
  });

  it('reutilizar un refresh token ya rotado responde 401 y revoca la sesión completa', async () => {
    const sesion = await registrarCliente(app);
    const rotada = await refrescar(sesion.cookieRefresh);
    expect(rotada.status).toBe(200);
    const cookieNueva = cookieRefresh(rotada)!;
    const accessNuevo = rotada.body.accessToken as string;

    const reutilizada = await refrescar(sesion.cookieRefresh);

    expect(reutilizada.status).toBe(401);
    expect(reutilizada.body.error.code).toBe('REFRESH_INVALIDO');
    // La familia completa quedó revocada: ni el refresh nuevo ni los access tokens sirven.
    expect((await refrescar(cookieNueva)).status).toBe(401);
    expect((await clienteHttp(app, accessNuevo).get('/api/auth/me')).status).toBe(401);
    expect((await clienteHttp(app, sesion).get('/api/auth/me')).status).toBe(401);
  });

  it('dos refresh simultáneos con el mismo token: solo uno obtiene un token nuevo', async () => {
    const sesion = await registrarCliente(app);

    const respuestas = await Promise.all([
      refrescar(sesion.cookieRefresh),
      refrescar(sesion.cookieRefresh),
    ]);

    const estados = respuestas.map((r) => r.status).sort();
    expect(estados).toEqual([200, 401]);
  });

  it('reutilizar un token no afecta otras sesiones del mismo usuario', async () => {
    const primera = await registrarCliente(app);
    const segunda = await iniciarSesion(app, primera.credenciales);
    await refrescar(primera.cookieRefresh);
    await refrescar(primera.cookieRefresh);

    expect((await refrescar(segunda.cookieRefresh)).status).toBe(200);
  });
});

describe('POST /api/auth/logout', () => {
  it('responde 204, borra la cookie y el mismo access token queda rechazado de inmediato', async () => {
    const sesion = await registrarCliente(app);
    const http = clienteHttp(app, sesion);
    expect((await http.get('/api/auth/me')).status).toBe(200);

    const respuesta = await http.post('/api/auth/logout').set('Cookie', sesion.cookieRefresh);

    expect(respuesta.status).toBe(204);
    const setCookie = (respuesta.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('refreshToken='),
    );
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);

    const despues = await http.get('/api/auth/me');
    expect(despues.status).toBe(401);
    expect(despues.body.error.code).toBe('NO_AUTENTICADO');

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sesion.cookieRefresh);
    expect(refresh.status).toBe(401);
  });

  it('solo con la cookie también termina la sesión y sus access tokens', async () => {
    const sesion = await registrarCliente(app);

    await request(app).post('/api/auth/logout').set('Cookie', sesion.cookieRefresh);

    expect((await clienteHttp(app, sesion).get('/api/auth/me')).status).toBe(401);
  });

  it('sin sesión responde 204 igualmente (idempotente)', async () => {
    const respuesta = await request(app).post('/api/auth/logout');

    expect(respuesta.status).toBe(204);
  });
});

describe('rate limiting por IP (rate-limit-redis)', () => {
  it('al superar el límite responde 429 DEMASIADAS_SOLICITUDES con Retry-After', async () => {
    // Limitador propio con límite 2 y prefijo único: el de la app está relajado en pruebas.
    const mini = express();
    mini.post(
      '/intento',
      crearLimitador({ nombre: `prueba-${randomUUID()}`, limite: 2, ventanaMin: 15 }),
      (_req, res) => {
        res.status(204).end();
      },
    );
    mini.use(errorHandler);

    expect((await request(mini).post('/intento')).status).toBe(204);
    expect((await request(mini).post('/intento')).status).toBe(204);
    const tercera = await request(mini).post('/intento');

    expect(tercera.status).toBe(429);
    expect(tercera.body.error.code).toBe('DEMASIADAS_SOLICITUDES');
    expect(Number(tercera.headers['retry-after'])).toBeGreaterThan(0);
  });
});
