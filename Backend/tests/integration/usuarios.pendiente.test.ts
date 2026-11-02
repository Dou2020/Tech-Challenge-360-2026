import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import {
  clienteComo,
  clienteHttp,
  correoUnico,
  correosPara,
  establecerContrasena,
  iniciarSesion,
  registrarCliente,
  tokenDelUltimoCorreo,
} from '../helpers/auth.js';

/* Campo contrasenaPendiente en perfil y administración de usuarios, e invitación a un Cliente. */

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

/** Cliente registrado que todavía no creó su contraseña. */
async function crearClientePendiente() {
  const correo = correoUnico('pendiente');
  await request(app).post('/api/auth/registro').send({ correo, nombre: 'Pen', apellido: 'Diente' });
  const listado = await admin.get('/api/usuarios').query({ q: correo });
  return { correo, idUsuario: listado.body.items[0].idUsuario as number };
}

async function crearStaffPendiente() {
  const correo = correoUnico('staff');
  const respuesta = await admin
    .post('/api/usuarios')
    .send({ correo, nombre: 'Staff', apellido: 'Nuevo', rol: 'Operador' });
  expect(respuesta.status).toBe(201);
  return { correo, idUsuario: respuesta.body.idUsuario as number };
}

describe('GET /api/perfil', () => {
  it('un usuario con contraseña tiene contrasenaPendiente false', async () => {
    // Arrange
    const sesion = await registrarCliente(app);

    // Act
    const respuesta = await clienteHttp(app, sesion).get('/api/perfil');

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.contrasenaPendiente).toBe(false);
  });
});

describe('administración de usuarios con la contraseña pendiente', () => {
  it('PUT /api/usuarios/:id conserva contrasenaPendiente true', async () => {
    // Arrange
    const { idUsuario } = await crearStaffPendiente();

    // Act
    const respuesta = await admin
      .put(`/api/usuarios/${idUsuario}`)
      .send({ nombre: 'Renombrado', apellido: 'Apellido', rol: 'Administrador' });

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({
      nombre: 'Renombrado',
      rol: 'Administrador',
      contrasenaPendiente: true,
    });
  });

  it('PATCH /api/usuarios/:id/estado conserva contrasenaPendiente true', async () => {
    // Arrange
    const { idUsuario } = await crearStaffPendiente();

    // Act
    const respuesta = await admin
      .patch(`/api/usuarios/${idUsuario}/estado`)
      .send({ activo: false });

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ activo: false, contrasenaPendiente: true });
  });

  it('el listado con filtros y orden trae contrasenaPendiente en cada fila', async () => {
    // Arrange
    const pendiente = await crearStaffPendiente();
    const conContrasena = await crearStaffPendiente();
    await establecerContrasena(app, conContrasena.correo, 'Nueva#2030');
    const prefijo = pendiente.correo.split('.')[0]!;

    // Act
    const respuesta = await admin
      .get('/api/usuarios')
      .query({ q: prefijo, rol: 'Operador', activo: 'true', sort: 'correo:desc', pageSize: 100 });

    // Assert
    expect(respuesta.status).toBe(200);
    const items = respuesta.body.items as { correo: string; contrasenaPendiente: boolean }[];
    const porCorreo = new Map(items.map((u) => [u.correo, u.contrasenaPendiente]));
    expect(porCorreo.get(pendiente.correo)).toBe(true);
    expect(porCorreo.get(conContrasena.correo)).toBe(false);
    const correos = items.map((u) => u.correo);
    expect(correos).toEqual([...correos].sort().reverse());
  });
});

describe('POST /api/usuarios/:id/invitacion a un Cliente', () => {
  it('con la contraseña pendiente responde 202 y manda un enlace de creación válido', async () => {
    // Arrange
    const { correo, idUsuario } = await crearClientePendiente();

    // Act
    const respuesta = await admin.post(`/api/usuarios/${idUsuario}/invitacion`);

    // Assert
    expect(respuesta.status).toBe(202);
    expect(correosPara(correo)).toHaveLength(2);
    await establecerContrasena(app, correo, 'Nueva#2030');
    expect((await iniciarSesion(app, { correo, contrasena: 'Nueva#2030' })).usuario.rol).toBe(
      'Cliente',
    );
  });

  it('el enlace reenviado invalida el del registro', async () => {
    // Arrange
    const { correo, idUsuario } = await crearClientePendiente();
    const delRegistro = tokenDelUltimoCorreo(correo);

    // Act
    await admin.post(`/api/usuarios/${idUsuario}/invitacion`);
    const respuesta = await request(app)
      .post('/api/auth/contrasena/verificar')
      .send({ token: delRegistro });

    // Assert
    expect(respuesta.status).toBe(400);
  });
});
