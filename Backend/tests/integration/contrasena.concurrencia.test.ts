import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import {
  clienteComo,
  correoUnico,
  correosPara,
  iniciarSesion,
  tokenDelUltimoCorreo,
} from '../helpers/auth.js';

/* Concurrencia en el canje de tokens de contraseña y en el registro. */

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

const registro = (correo: string) =>
  request(app).post('/api/auth/registro').send({ correo, nombre: 'Con', apellido: 'Currente' });

describe('canje simultáneo del mismo token', () => {
  it('dos establecer con el mismo token → exactamente un 204 y un 400 TOKEN_CONTRASENA_INVALIDO', async () => {
    // Arrange
    const correo = correoUnico('carrera');
    await registro(correo);
    const token = tokenDelUltimoCorreo(correo);
    const establecer = (contrasena: string) =>
      request(app).post('/api/auth/contrasena/establecer').send({ token, contrasena });

    // Act
    const respuestas = await Promise.all([establecer('Primera#2030'), establecer('Segunda#2030')]);

    // Assert
    expect(respuestas.map((r) => r.status).sort()).toEqual([204, 400]);
    const rechazada = respuestas.find((r) => r.status === 400);
    expect(rechazada?.body.error.code).toBe('TOKEN_CONTRASENA_INVALIDO');
    const ganadora = respuestas[0]!.status === 204 ? 'Primera#2030' : 'Segunda#2030';
    expect((await iniciarSesion(app, { correo, contrasena: ganadora })).usuario.correo).toBe(
      correo,
    );
  });
});

describe('registro simultáneo del mismo correo', () => {
  it('dos registros a la vez → ambos 202 y una sola cuenta', async () => {
    // Arrange
    const correo = correoUnico('doble');

    // Act
    const respuestas = await Promise.all([registro(correo), registro(correo)]);

    // Assert
    expect(respuestas.map((r) => r.status)).toEqual([202, 202]);
    expect(respuestas[0]!.body).toEqual(respuestas[1]!.body);
    const listado = await admin.get('/api/usuarios').query({ q: correo });
    expect(listado.body.total).toBe(1);
    expect(listado.body.items[0]).toMatchObject({ correo, contrasenaPendiente: true });
    expect(correosPara(correo).length).toBeGreaterThanOrEqual(1);
  });
});
