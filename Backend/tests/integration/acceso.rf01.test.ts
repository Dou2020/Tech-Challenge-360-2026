import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { AUDIENCIA_TOKEN, EMISOR_TOKEN } from '../../src/modules/auth/tokens.js';
import { clienteHttp, iniciarSesionComo, type UsuarioSemilla } from '../helpers/auth.js';

/*
 * RF-01 transversal: token vencido → 401 y rol sin permiso → 403 en cada módulo con rutas
 * protegidas. Los 404 por recurso ajeno viven en direcciones.test.ts y carrito.test.ts.
 */

const app = createApp();

beforeAll(async () => {
  await connectRedis();
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

/** Access token firmado de verdad pero ya vencido, con la sesión de un usuario de la semilla. */
async function tokenVencido(usuario: UsuarioSemilla): Promise<string> {
  const sesion = await iniciarSesionComo(app, usuario);
  const { sid } = jwt.decode(sesion.accessToken) as { sid: string };
  return jwt.sign({ rol: sesion.usuario.rol, sid }, env.JWT_ACCESS_SECRET, {
    subject: String(sesion.usuario.idUsuario),
    jwtid: randomUUID(),
    issuer: EMISOR_TOKEN,
    audience: AUDIENCIA_TOKEN,
    expiresIn: -60,
  });
}

describe('token vencido → 401 TOKEN_EXPIRADO en cada módulo', () => {
  it.each([
    ['auth', 'cliente', '/api/auth/me'],
    ['direcciones', 'cliente', '/api/direcciones'],
    ['carrito', 'cliente', '/api/carrito'],
    ['inventario', 'operador', '/api/inventario/existencias'],
    ['catálogo (gestión)', 'admin', '/api/productos'],
    ['cupones', 'admin', '/api/cupones'],
  ] as const)('%s', async (_modulo, usuario, ruta) => {
    // Arrange
    const vencido = await tokenVencido(usuario);

    // Act
    const respuesta = await clienteHttp(app, vencido).get(ruta);

    // Assert
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('TOKEN_EXPIRADO');
  });
});

describe('sin token → 401 NO_AUTENTICADO en cada módulo protegido', () => {
  it.each([
    '/api/auth/me',
    '/api/direcciones',
    '/api/inventario/existencias',
    '/api/productos',
    '/api/categorias',
    '/api/cupones',
  ])('GET %s', async (ruta) => {
    // Arrange: sin Authorization

    // Act
    const respuesta = await request(app).get(ruta);

    // Assert
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
  });
});

describe('rol sin permiso → 403 PROHIBIDO en cada módulo', () => {
  it.each([
    ['cliente', '/api/inventario/existencias'],
    ['cliente', '/api/productos'],
    ['cliente', '/api/cupones'],
    ['operador', '/api/productos'],
    ['operador', '/api/cupones'],
    ['operador', '/api/direcciones'],
    ['admin', '/api/direcciones'],
    ['operador', '/api/carrito'],
    ['admin', '/api/carrito'],
  ] as const)('%s en GET %s', async (usuario, ruta) => {
    // Arrange
    const sesion = await iniciarSesionComo(app, usuario);

    // Act
    const respuesta = await clienteHttp(app, sesion).get(ruta);

    // Assert
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.code).toBe('PROHIBIDO');
  });
});
