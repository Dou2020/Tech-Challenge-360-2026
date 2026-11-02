import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { closeRedis, connectRedis, redis } from '../../src/config/redis.js';
import { claves } from '../../src/shared/cache/claves.js';
import {
  USUARIOS_SEMILLA,
  bandeja,
  clienteComo,
  clienteHttp,
  correoUnico,
  correosPara,
  establecerContrasena,
  iniciarSesion,
  registrarCliente,
  tokenDelUltimoCorreo,
} from '../helpers/auth.js';

/*
 * Crear y recuperar contraseña (enlaces de correo) y la invitación del Administrador.
 * El transporte de correo es `memoria`: los enlaces se leen de la bandeja.
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

const NUEVA = 'Nueva#2030';

const olvido = (correo: string) =>
  request(app).post('/api/auth/contrasena/olvido').send({ correo });
const verificar = (token: string) =>
  request(app).post('/api/auth/contrasena/verificar').send({ token });
const establecer = (token: string, contrasena = NUEVA) =>
  request(app).post('/api/auth/contrasena/establecer').send({ token, contrasena });

/** Registra un Cliente sin crear su contraseña y devuelve su correo. */
async function registrarPendiente(): Promise<string> {
  const correo = correoUnico('pendiente');
  const respuesta = await request(app)
    .post('/api/auth/registro')
    .send({ correo, nombre: 'Pen', apellido: 'Diente' });
  expect(respuesta.status).toBe(202);
  return correo;
}

describe('POST /api/auth/contrasena/olvido', () => {
  it('con un usuario activo responde 202 y manda el enlace de restablecer', async () => {
    // Arrange
    const { credenciales } = await registrarCliente(app);

    // Act
    const respuesta = await olvido(credenciales.correo);

    // Assert
    expect(respuesta.status).toBe(202);
    const mensaje = correosPara(credenciales.correo).at(-1);
    expect(mensaje?.asunto).toMatch(/Restablece/);
    expect(mensaje?.texto).toContain(`${env.APP_URL_PUBLICA}/restablecer-contrasena#token=`);
  });

  it('con un correo inexistente responde 202 con el mismo cuerpo y no manda correo', async () => {
    // Arrange
    const { credenciales } = await registrarCliente(app);
    const existente = await olvido(credenciales.correo);
    const inexistente = correoUnico('nadie');

    // Act
    const respuesta = await olvido(inexistente);

    // Assert
    expect(respuesta.status).toBe(202);
    expect(respuesta.body).toEqual(existente.body);
    expect(correosPara(inexistente)).toHaveLength(0);
  });

  it('con un usuario desactivado responde 202 y no manda correo', async () => {
    // Arrange
    bandeja().vaciarBandeja();

    // Act
    const respuesta = await olvido(USUARIOS_SEMILLA.inactivo.correo);

    // Assert
    expect(respuesta.status).toBe(202);
    expect(correosPara(USUARIOS_SEMILLA.inactivo.correo)).toHaveLength(0);
  });

  it('con una cuenta que aún no creó su contraseña manda el enlace de creación', async () => {
    // Arrange
    const correo = await registrarPendiente();

    // Act
    const respuesta = await olvido(correo);

    // Assert
    expect(respuesta.status).toBe(202);
    expect(correosPara(correo)).toHaveLength(2);
    expect(correosPara(correo).at(-1)?.texto).toContain('/crear-contrasena#token=');
  });

  it('un correo inválido responde 400 VALIDACION', async () => {
    // Act
    const respuesta = await olvido('no-es-correo');

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });
});

describe('POST /api/auth/contrasena/verificar', () => {
  it('devuelve el propósito y el correo, y no consume el token', async () => {
    // Arrange
    const correo = await registrarPendiente();
    const token = tokenDelUltimoCorreo(correo);

    // Act
    const primera = await verificar(token);
    const segunda = await verificar(token);

    // Assert
    expect(primera.status).toBe(200);
    expect(primera.body).toEqual({ proposito: 'CREAR', correo });
    expect(segunda.status).toBe(200);
  });

  it('el token de un olvido tiene propósito RESTABLECER', async () => {
    // Arrange
    const { credenciales } = await registrarCliente(app);
    await olvido(credenciales.correo);

    // Act
    const respuesta = await verificar(tokenDelUltimoCorreo(credenciales.correo));

    // Assert
    expect(respuesta.body).toEqual({ proposito: 'RESTABLECER', correo: credenciales.correo });
  });

  it.each(['token-que-no-existe', 'A'.repeat(43)])(
    'el token "%s" responde 400 TOKEN_CONTRASENA_INVALIDO',
    async (token) => {
      // Act
      const respuesta = await verificar(token);

      // Assert
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.code).toBe('TOKEN_CONTRASENA_INVALIDO');
    },
  );

  it('sin token responde 400 VALIDACION', async () => {
    // Act
    const respuesta = await request(app).post('/api/auth/contrasena/verificar').send({});

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });
});

describe('POST /api/auth/contrasena/establecer', () => {
  it('crea la contraseña de una cuenta pendiente y permite iniciar sesión', async () => {
    // Arrange
    const correo = await registrarPendiente();

    // Act
    const respuesta = await establecer(tokenDelUltimoCorreo(correo));

    // Assert
    expect(respuesta.status).toBe(204);
    const sesion = await iniciarSesion(app, { correo, contrasena: NUEVA });
    expect(sesion.usuario.correo).toBe(correo);
  });

  it('el token es de un solo uso: el segundo canje responde 400', async () => {
    // Arrange
    const correo = await registrarPendiente();
    const token = tokenDelUltimoCorreo(correo);
    await establecer(token);

    // Act
    const respuesta = await establecer(token, 'Otra#2031');

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('TOKEN_CONTRASENA_INVALIDO');
    expect((await verificar(token)).status).toBe(400);
  });

  it('pedir un enlace nuevo invalida el anterior', async () => {
    // Arrange
    const { credenciales } = await registrarCliente(app);
    await olvido(credenciales.correo);
    const viejo = tokenDelUltimoCorreo(credenciales.correo);
    await olvido(credenciales.correo);
    const nuevo = tokenDelUltimoCorreo(credenciales.correo);

    // Act
    const conViejo = await establecer(viejo);
    const conNuevo = await establecer(nuevo);

    // Assert
    expect(conViejo.status).toBe(400);
    expect(conNuevo.status).toBe(204);
  });

  it('un token vencido responde 400', async () => {
    // Arrange
    const correo = await registrarPendiente();
    const token = tokenDelUltimoCorreo(correo);
    const clave = claves.tokenContrasena(createHash('sha256').update(token).digest('hex'));
    await redis.pExpire(clave, 30);
    await new Promise((resolver) => setTimeout(resolver, 120));

    // Act
    const respuesta = await establecer(token);

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('TOKEN_CONTRASENA_INVALIDO');
  });

  it('una contraseña que incumple la política responde 400 VALIDACION y no consume el token', async () => {
    // Arrange
    const correo = await registrarPendiente();
    const token = tokenDelUltimoCorreo(correo);

    // Act
    const debil = await establecer(token, 'corta');
    const valida = await establecer(token);

    // Assert
    expect(debil.status).toBe(400);
    expect(debil.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'contrasena' })]),
    );
    expect(valida.status).toBe(204);
  });

  it('al restablecer cierra las sesiones abiertas y la contraseña anterior deja de servir', async () => {
    // Arrange
    const sesion = await registrarCliente(app);
    const { credenciales } = sesion;
    await olvido(credenciales.correo);

    // Act
    const respuesta = await establecer(tokenDelUltimoCorreo(credenciales.correo));

    // Assert
    expect(respuesta.status).toBe(204);
    expect((await clienteHttp(app, sesion).get('/api/auth/me')).status).toBe(401);
    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sesion.cookieRefresh);
    expect(refresh.status).toBe(401);
    const vieja = await request(app).post('/api/auth/login').send(credenciales);
    expect(vieja.status).toBe(401);
    await iniciarSesion(app, { correo: credenciales.correo, contrasena: NUEVA });
  });

  it('limpia el bloqueo por intentos fallidos', async () => {
    // Arrange
    const { credenciales } = await registrarCliente(app);
    for (let intento = 0; intento < env.LOGIN_MAX_INTENTOS; intento++) {
      await request(app)
        .post('/api/auth/login')
        .send({ correo: credenciales.correo, contrasena: 'Incorrecta#1' });
    }
    const bloqueado = await request(app).post('/api/auth/login').send(credenciales);
    await olvido(credenciales.correo);

    // Act
    await establecer(tokenDelUltimoCorreo(credenciales.correo));
    const login = await request(app)
      .post('/api/auth/login')
      .send({ correo: credenciales.correo, contrasena: NUEVA });

    // Assert
    expect(bloqueado.status).toBe(429);
    expect(login.status).toBe(200);
  });

  it('si el usuario se desactivó después de pedir el enlace responde 403 y el token queda consumido', async () => {
    // Arrange
    const { credenciales, usuario } = await registrarCliente(app);
    await olvido(credenciales.correo);
    const token = tokenDelUltimoCorreo(credenciales.correo);
    await admin.patch(`/api/usuarios/${usuario.idUsuario}/estado`).send({ activo: false });

    // Act
    const respuesta = await establecer(token);
    const reintento = await establecer(token);

    // Assert
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.code).toBe('USUARIO_INACTIVO');
    expect(reintento.status).toBe(400);
  });
});

describe('invitación del Administrador', () => {
  async function crearStaff(rol: 'Operador' | 'Administrador' = 'Operador') {
    const correo = correoUnico('staff');
    const respuesta = await admin
      .post('/api/usuarios')
      .send({ correo, nombre: 'Staff', apellido: 'Nuevo', rol });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return { correo, idUsuario: respuesta.body.idUsuario as number, respuesta };
  }

  it('crear un usuario manda la invitación y lo deja con la contraseña pendiente', async () => {
    // Act
    const { correo, idUsuario, respuesta } = await crearStaff('Administrador');

    // Assert
    expect(respuesta.body).toMatchObject({
      correo,
      rol: 'Administrador',
      contrasenaPendiente: true,
    });
    const mensaje = correosPara(correo).at(-1);
    expect(mensaje?.asunto).toMatch(/invitaron/);
    expect(mensaje?.texto).toContain('/crear-contrasena#token=');
    const detalle = await admin.get(`/api/usuarios/${idUsuario}`);
    expect(detalle.body.contrasenaPendiente).toBe(true);
  });

  it('al crear la contraseña con el enlace, contrasenaPendiente pasa a false y puede iniciar sesión', async () => {
    // Arrange
    const { correo, idUsuario } = await crearStaff();

    // Act
    await establecerContrasena(app, correo, NUEVA);

    // Assert
    const detalle = await admin.get(`/api/usuarios/${idUsuario}`);
    expect(detalle.body.contrasenaPendiente).toBe(false);
    const listado = await admin.get(`/api/usuarios?q=${encodeURIComponent(correo)}`);
    expect(listado.body.items[0].contrasenaPendiente).toBe(false);
    expect((await iniciarSesion(app, { correo, contrasena: NUEVA })).usuario.rol).toBe('Operador');
  });

  it('ya no acepta la contraseña en el alta: se ignora', async () => {
    // Arrange
    const correo = correoUnico('staff');

    // Act
    await admin
      .post('/api/usuarios')
      .send({ correo, contrasena: 'Operador#2027', nombre: 'S', apellido: 'T', rol: 'Operador' });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ correo, contrasena: 'Operador#2027' });

    // Assert
    expect(login.status).toBe(401);
  });

  it('reenviar la invitación responde 202, manda otro correo e invalida el enlace anterior', async () => {
    // Arrange
    const { correo, idUsuario } = await crearStaff();
    const viejo = tokenDelUltimoCorreo(correo);

    // Act
    const respuesta = await admin.post(`/api/usuarios/${idUsuario}/invitacion`);

    // Assert
    expect(respuesta.status).toBe(202);
    expect(correosPara(correo)).toHaveLength(2);
    expect((await verificar(viejo)).status).toBe(400);
    expect((await verificar(tokenDelUltimoCorreo(correo))).status).toBe(200);
  });

  it('reenviar a quien ya creó su contraseña responde 409 CONTRASENA_YA_CREADA', async () => {
    // Arrange
    const { correo, idUsuario } = await crearStaff();
    await establecerContrasena(app, correo, NUEVA);

    // Act
    const respuesta = await admin.post(`/api/usuarios/${idUsuario}/invitacion`);

    // Assert
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('CONTRASENA_YA_CREADA');
  });

  it('reenviar a un usuario desactivado responde 403 USUARIO_INACTIVO', async () => {
    // Arrange
    const { correo, idUsuario } = await crearStaff();
    await admin.patch(`/api/usuarios/${idUsuario}/estado`).send({ activo: false });
    const antes = correosPara(correo).length;

    // Act
    const respuesta = await admin.post(`/api/usuarios/${idUsuario}/invitacion`);

    // Assert
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.code).toBe('USUARIO_INACTIVO');
    expect(correosPara(correo)).toHaveLength(antes);
  });

  it('un usuario inexistente responde 404; Cliente y Operador reciben 403; sin token, 401', async () => {
    // Arrange
    const cliente = (await clienteComo(app, 'cliente')).http;
    const operador = (await clienteComo(app, 'operador')).http;

    // Act
    const inexistente = await admin.post('/api/usuarios/2147483000/invitacion');
    const comoCliente = await cliente.post('/api/usuarios/1/invitacion');
    const comoOperador = await operador.post('/api/usuarios/1/invitacion');
    const sinToken = await request(app).post('/api/usuarios/1/invitacion');

    // Assert
    expect(inexistente.status).toBe(404);
    expect(comoCliente.status).toBe(403);
    expect(comoOperador.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});
