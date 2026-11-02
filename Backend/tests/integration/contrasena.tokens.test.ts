import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis, redis } from '../../src/config/redis.js';
import { claves } from '../../src/shared/cache/claves.js';
import {
  USUARIOS_SEMILLA,
  bandeja,
  clienteComo,
  correoUnico,
  correosPara,
  establecerContrasena,
  registrarCliente,
  tokenDelUltimoCorreo,
} from '../helpers/auth.js';

/*
 * Complementa contrasena.test.ts: vigencia real en Redis, bitácora del canje y respuestas
 * indistinguibles en registro y olvido (no revelan qué correos existen).
 */

const app = createApp();

type Http = Awaited<ReturnType<typeof clienteComo>>['http'];
let admin: Http;

beforeAll(async () => {
  await connectRedis();
  ({ http: admin } = await clienteComo(app, 'admin'));
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

const registrar = (correo: string) =>
  request(app).post('/api/auth/registro').send({ correo, nombre: 'Ana', apellido: 'López' });
const olvido = (correo: string) =>
  request(app).post('/api/auth/contrasena/olvido').send({ correo });

const ttlDelToken = (token: string) =>
  redis.ttl(claves.tokenContrasena(createHash('sha256').update(token).digest('hex')));

describe('vigencia del token en Redis', () => {
  const TOLERANCIA_SEG = 60;

  it('el enlace de creación (registro) vence en 72 h (259200 s)', async () => {
    // Arrange
    const correo = correoUnico('ttl');
    await registrar(correo);

    // Act
    const ttl = await ttlDelToken(tokenDelUltimoCorreo(correo));

    // Assert
    expect(ttl).toBeLessThanOrEqual(259_200);
    expect(ttl).toBeGreaterThan(259_200 - TOLERANCIA_SEG);
  });

  it('el enlace de restablecer (olvido) vence en 60 min (3600 s)', async () => {
    // Arrange
    const { credenciales } = await registrarCliente(app);
    await olvido(credenciales.correo);

    // Act
    const ttl = await ttlDelToken(tokenDelUltimoCorreo(credenciales.correo));

    // Assert
    expect(ttl).toBeLessThanOrEqual(3600);
    expect(ttl).toBeGreaterThan(3600 - TOLERANCIA_SEG);
  });

  it('al canjear el token desaparece de Redis junto con el puntero del usuario', async () => {
    // Arrange
    const correo = correoUnico('ttl');
    await registrar(correo);
    const token = tokenDelUltimoCorreo(correo);
    await establecerContrasena(app, correo, 'Nueva#2030');

    // Act
    const ttl = await ttlDelToken(token);

    // Assert
    expect(ttl).toBe(-2);
  });
});

describe('bitácora del canje', () => {
  it('establecer la contraseña deja una sola entrada {"ContrasenaCambiada":true} a nombre del propio usuario', async () => {
    // Arrange
    const correo = correoUnico('bitacora');
    await registrar(correo);
    const token = tokenDelUltimoCorreo(correo);
    const contrasena = 'Secreta#2031';
    const idUsuario = (await admin.get('/api/usuarios').query({ q: correo })).body.items[0]
      .idUsuario as number;

    // Act
    const canje = await request(app)
      .post('/api/auth/contrasena/establecer')
      .send({ token, contrasena });

    // Assert
    expect(canje.status).toBe(204);
    const bitacora = await admin
      .get('/api/bitacora')
      .query({ modulo: 'Usuarios', idRegistro: idUsuario, accion: 'MODIFICAR' });
    expect(bitacora.body.total).toBe(1);
    const entrada = bitacora.body.items[0] as { idUsuario: number; valorNuevo: unknown };
    expect(entrada.valorNuevo).toEqual({ ContrasenaCambiada: true });
    expect(entrada.idUsuario).toBe(idUsuario);
    expect(JSON.stringify(bitacora.body)).not.toContain(contrasena);
    expect(JSON.stringify(bitacora.body)).not.toContain(token);
  });
});

/** Cada caso deja una cuenta en un estado distinto y devuelve el correo. */
const ESTADOS = {
  nuevo: async () => correoUnico('nuevo'),
  pendiente: async () => {
    const correo = correoUnico('pendiente');
    await registrar(correo);
    return correo;
  },
  'con contraseña': async () => (await registrarCliente(app)).credenciales.correo,
  inactivo: async () => USUARIOS_SEMILLA.inactivo.correo,
} as const;

type Estado = keyof typeof ESTADOS;

describe('POST /api/auth/registro: respuesta idéntica y correo según el estado de la cuenta', () => {
  const CASOS: [Estado, RegExp | null, string | null][] = [
    ['nuevo', /Bienvenido/, '/crear-contrasena#token='],
    ['pendiente', /Bienvenido/, '/crear-contrasena#token='],
    ['con contraseña', /Ya tienes una cuenta/, '/recuperar-contrasena'],
    ['inactivo', null, null],
  ];

  it.each(CASOS)(
    '%s → 202 con el cuerpo común y el correo esperado',
    async (estado, asunto, enlace) => {
      // Arrange
      const correo = await ESTADOS[estado]();
      bandeja().vaciarBandeja();

      // Act
      const respuesta = await registrar(correo);

      // Assert
      expect(respuesta.status).toBe(202);
      expect(respuesta.body).toEqual({
        mensaje:
          'Si el correo puede registrarse, te enviamos un mensaje con el enlace para crear tu contraseña.',
      });
      expect(respuesta.headers['set-cookie']).toBeUndefined();
      const mensajes = correosPara(correo);
      if (!asunto || !enlace) {
        expect(mensajes).toHaveLength(0);
      } else {
        expect(mensajes).toHaveLength(1);
        expect(mensajes[0]?.asunto).toMatch(asunto);
        expect(mensajes[0]?.texto).toContain(enlace);
      }
    },
  );
});

describe('POST /api/auth/contrasena/olvido: respuesta idéntica según el estado de la cuenta', () => {
  it.each(Object.keys(ESTADOS) as Estado[])('%s → 202 con el cuerpo común', async (estado) => {
    // Arrange
    const correo = await ESTADOS[estado]();

    // Act
    const respuesta = await olvido(correo);

    // Assert
    expect(respuesta.status).toBe(202);
    expect(respuesta.body).toEqual({
      mensaje:
        'Si el correo tiene una cuenta, te enviamos un mensaje con el enlace para restablecer tu contraseña.',
    });
  });
});
