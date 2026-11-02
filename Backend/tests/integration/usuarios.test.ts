import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import {
  clienteComo,
  clienteHttp,
  correoUnico,
  establecerContrasena,
  iniciarSesion,
  registrarCliente,
} from '../helpers/auth.js';

/*
 * Perfil (cualquier rol autenticado) y administración de usuarios (RF-09 y casos de Redis).
 * La base y Redis se comparten con otros archivos: cada prueba crea sus propios usuarios con
 * correo único y deja intactos a los de la semilla.
 */

const app = createApp();

type Http = Awaited<ReturnType<typeof clienteComo>>['http'];
let admin: Http;
let idAdmin: number;
let operador: Http;
let cliente: Http;

beforeAll(async () => {
  await connectRedis();
  const comoAdmin = await clienteComo(app, 'admin');
  admin = comoAdmin.http;
  idAdmin = comoAdmin.sesion.usuario.idUsuario;
  operador = (await clienteComo(app, 'operador')).http;
  cliente = (await clienteComo(app, 'cliente')).http;
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

const CONTRASENA = 'Operador#2027';

/**
 * Crea un Operador (o Administrador) desechable y devuelve su id y credenciales. El usuario nace
 * sin contraseña: la crea con el enlace de la invitación, como en producción.
 */
async function crearUsuario(rol: 'Operador' | 'Administrador' = 'Operador') {
  const correo = correoUnico('staff');
  const respuesta = await admin
    .post('/api/usuarios')
    .send({ correo, nombre: 'Staff', apellido: 'De Prueba', rol });
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
  await establecerContrasena(app, correo, CONTRASENA);
  return {
    idUsuario: respuesta.body.idUsuario as number,
    credenciales: { correo, contrasena: CONTRASENA },
  };
}

describe('acceso por rol', () => {
  it('Cliente y Operador reciben 403 en /api/usuarios; sin token, 401', async () => {
    // Arrange
    const peticiones = [
      cliente.get('/api/usuarios'),
      operador.get('/api/usuarios'),
      cliente.post('/api/usuarios').send({}),
      operador.patch('/api/usuarios/1/estado').send({ activo: false }),
    ];

    // Act
    const respuestas = await Promise.all(peticiones);
    const sinToken = await request(app).get('/api/usuarios');

    // Assert
    for (const respuesta of respuestas) expect(respuesta.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('perfil', () => {
  it('GET y PUT /api/perfil usan el id del token y actualizan nombre y teléfono', async () => {
    // Arrange
    const sesion = await registrarCliente(app);
    const http = clienteHttp(app, sesion);

    // Act
    const obtenido = await http.get('/api/perfil');
    const actualizado = await http
      .put('/api/perfil')
      .send({ nombre: 'Marta', apellido: 'Pérez', telefono: '5555-1111' });
    const sinTelefono = await http.put('/api/perfil').send({ nombre: 'Marta', apellido: 'Pérez' });

    // Assert
    expect(obtenido.status).toBe(200);
    expect(obtenido.body).toMatchObject({
      idUsuario: sesion.usuario.idUsuario,
      correo: sesion.credenciales.correo,
      rol: 'Cliente',
    });
    expect(actualizado.status).toBe(200);
    expect(actualizado.body).toMatchObject({ nombre: 'Marta', telefono: '5555-1111' });
    expect(sinTelefono.body.telefono).toBeNull();
  });

  it('GET /api/auth/me refleja el nombre nuevo tras PUT /api/perfil (caché invalidada)', async () => {
    // Arrange
    const sesion = await registrarCliente(app);
    const http = clienteHttp(app, sesion);
    await http.get('/api/auth/me');
    expect((await http.get('/api/auth/me')).headers['x-cache']).toBe('HIT');
    const cambio = await http.put('/api/perfil').send({ nombre: 'Renombrada', apellido: 'Nueva' });
    expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);

    // Act
    const respuesta = await http.get('/api/auth/me');

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ nombre: 'Renombrada', apellido: 'Nueva' });
  });

  it('rechaza nombre vacío con 400', async () => {
    // Arrange
    const sesion = await registrarCliente(app);

    // Act
    const respuesta = await clienteHttp(app, sesion)
      .put('/api/perfil')
      .send({ nombre: '  ', apellido: 'X' });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('el cambio de contraseña conserva la sesión actual y revoca las demás', async () => {
    // Arrange
    const actual = await registrarCliente(app);
    const otra = await iniciarSesion(app, actual.credenciales);
    const nueva = 'NuevaClave2027';

    // Act
    const cambio = await clienteHttp(app, actual)
      .put('/api/perfil/contrasena')
      .send({ contrasenaActual: actual.credenciales.contrasena, contrasenaNueva: nueva });

    // Assert
    expect(cambio.status).toBe(204);
    expect((await clienteHttp(app, actual).get('/api/perfil')).status).toBe(200);
    const renovada = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', actual.cookieRefresh);
    expect(renovada.status).toBe(200);
    expect(
      (await clienteHttp(app, renovada.body.accessToken as string).get('/api/perfil')).status,
    ).toBe(200);
    expect((await clienteHttp(app, otra).get('/api/perfil')).status).toBe(401);
    expect(
      (await request(app).post('/api/auth/refresh').set('Cookie', otra.cookieRefresh)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ correo: actual.credenciales.correo, contrasena: actual.credenciales.contrasena })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .send({ correo: actual.credenciales.correo, contrasena: nueva })
      ).status,
    ).toBe(200);
  });

  // El cambio ocurre en un segundo posterior a la emisión del access token: un `revocado-desde`
  // escrito pese a `exceptoSid` lo rechazaría (iat < revocado-desde).
  it('tras cambiar la contraseña el access token de la sesión actual sigue valiendo', async () => {
    // Arrange
    const actual = await registrarCliente(app);
    await new Promise((resolver) => setTimeout(resolver, 1_100));

    // Act
    const cambio = await clienteHttp(app, actual).put('/api/perfil/contrasena').send({
      contrasenaActual: actual.credenciales.contrasena,
      contrasenaNueva: 'NuevaClave2029',
    });

    // Assert
    expect(cambio.status).toBe(204);
    expect((await clienteHttp(app, actual).get('/api/perfil')).status).toBe(200);
  });

  it('contraseña actual incorrecta → 400 VALIDACION y no cambia nada', async () => {
    // Arrange
    const sesion = await registrarCliente(app);

    // Act
    const respuesta = await clienteHttp(app, sesion)
      .put('/api/perfil/contrasena')
      .send({ contrasenaActual: 'Incorrecta123', contrasenaNueva: 'OtraClave2027' });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    expect(respuesta.body.error.details[0].field).toBe('contrasenaActual');
    await iniciarSesion(app, sesion.credenciales);
  });

  it('contraseña nueva débil → 400', async () => {
    // Arrange
    const sesion = await registrarCliente(app);

    // Act
    const respuesta = await clienteHttp(app, sesion)
      .put('/api/perfil/contrasena')
      .send({ contrasenaActual: sesion.credenciales.contrasena, contrasenaNueva: 'corta' });

    // Assert
    expect(respuesta.status).toBe(400);
  });
});

describe('administración de usuarios', () => {
  it('crea un Operador, lo lista, lo consulta y lo actualiza', async () => {
    // Arrange
    const { idUsuario, credenciales } = await crearUsuario();

    // Act
    const detalle = await admin.get(`/api/usuarios/${idUsuario}`);
    const listado = await admin
      .get('/api/usuarios')
      .query({ q: credenciales.correo, rol: 'Operador', activo: 'true' });
    const actualizado = await admin
      .put(`/api/usuarios/${idUsuario}`)
      .send({ nombre: 'Nuevo', apellido: 'Nombre', telefono: '5555-2222' });

    // Assert
    expect(detalle.status).toBe(200);
    expect(detalle.body).toMatchObject({
      correo: credenciales.correo,
      rol: 'Operador',
      activo: true,
    });
    expect(detalle.body).not.toHaveProperty('hashContrasena');
    expect(listado.body.total).toBe(1);
    expect(listado.body.items[0].idUsuario).toBe(idUsuario);
    expect(actualizado.status).toBe(200);
    expect(actualizado.body).toMatchObject({ nombre: 'Nuevo', rol: 'Operador' });
    await iniciarSesion(app, credenciales);
  });

  it('correo repetido → 409 DUPLICADO; rol Cliente → 400; usuario inexistente → 404', async () => {
    // Arrange
    const { credenciales } = await crearUsuario();
    const base = { nombre: 'A', apellido: 'B' };

    // Act
    const repetido = await admin
      .post('/api/usuarios')
      .send({ ...base, correo: credenciales.correo, rol: 'Operador' });
    const cliente400 = await admin
      .post('/api/usuarios')
      .send({ ...base, correo: correoUnico('staff'), rol: 'Cliente' });
    const inexistente = await admin.get('/api/usuarios/2147483000');

    // Assert
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.code).toBe('DUPLICADO');
    expect(cliente400.status).toBe(400);
    expect(inexistente.status).toBe(404);
  });

  it('un Administrador no puede desactivarse a sí mismo: 409 EN_USO', async () => {
    // Arrange
    const ruta = `/api/usuarios/${idAdmin}/estado`;

    // Act
    const respuesta = await admin.patch(ruta).send({ activo: false });

    // Assert
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('EN_USO');
    expect((await admin.get(`/api/usuarios/${idAdmin}`)).body.activo).toBe(true);
  });

  it('desactivar un usuario con sesión abierta invalida su access token y su refresh token', async () => {
    // Arrange
    const { idUsuario, credenciales } = await crearUsuario();
    const sesion = await iniciarSesion(app, credenciales);
    expect((await clienteHttp(app, sesion).get('/api/inventario/tipos-movimiento')).status).toBe(
      200,
    );

    // Act
    const respuesta = await admin
      .patch(`/api/usuarios/${idUsuario}/estado`)
      .send({ activo: false });

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.activo).toBe(false);
    expect((await clienteHttp(app, sesion).get('/api/inventario/tipos-movimiento')).status).toBe(
      401,
    );
    expect(
      (await request(app).post('/api/auth/refresh').set('Cookie', sesion.cookieRefresh)).status,
    ).toBe(403);
    const login = await request(app).post('/api/auth/login').send(credenciales);
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('USUARIO_INACTIVO');
  });

  it('el cambio de rol revoca el acceso inmediato del token anterior', async () => {
    // Arrange
    const { idUsuario, credenciales } = await crearUsuario();
    const sesion = await iniciarSesion(app, credenciales);

    // Act
    const respuesta = await admin.put(`/api/usuarios/${idUsuario}`).send({
      nombre: 'Staff',
      apellido: 'De Prueba',
      rol: 'Cliente',
    });

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.rol).toBe('Cliente');
    expect((await clienteHttp(app, sesion).get('/api/inventario/tipos-movimiento')).status).toBe(
      401,
    );
    const nueva = await iniciarSesion(app, credenciales);
    expect(nueva.usuario.rol).toBe('Cliente');
  });

  it('reactivar permite iniciar sesión otra vez', async () => {
    // Arrange
    const { idUsuario, credenciales } = await crearUsuario();
    await admin.patch(`/api/usuarios/${idUsuario}/estado`).send({ activo: false });

    // Act
    const respuesta = await admin.patch(`/api/usuarios/${idUsuario}/estado`).send({ activo: true });

    // Assert
    expect(respuesta.body.activo).toBe(true);
    await iniciarSesion(app, credenciales);
  });

  it('un Administrador no puede quitarse a sí mismo el rol Administrador: 409 EN_USO', async () => {
    // Arrange
    const { idUsuario, credenciales } = await crearUsuario('Administrador');
    const sesion = await iniciarSesion(app, credenciales);

    // Act
    const respuesta = await clienteHttp(app, sesion)
      .put(`/api/usuarios/${idUsuario}`)
      .send({ nombre: 'Staff', apellido: 'De Prueba', rol: 'Operador' });

    // Assert
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('EN_USO');
    expect((await admin.get(`/api/usuarios/${idUsuario}`)).body.rol).toBe('Administrador');
  });

  it('desactivar a otro Administrador (hay más de uno activo) se permite y revoca su sesión', async () => {
    // Arrange
    const { idUsuario, credenciales } = await crearUsuario('Administrador');
    const sesion = await iniciarSesion(app, credenciales);

    // Act
    const respuesta = await admin
      .patch(`/api/usuarios/${idUsuario}/estado`)
      .send({ activo: false });

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body).toMatchObject({ rol: 'Administrador', activo: false });
    expect((await clienteHttp(app, sesion).get('/api/usuarios')).status).toBe(401);
  });

  it('reactivar a un Administrador desactivado lo deja entrar de nuevo', async () => {
    // Arrange
    const { idUsuario, credenciales } = await crearUsuario('Administrador');
    const baja = await admin.patch(`/api/usuarios/${idUsuario}/estado`).send({ activo: false });
    expect(baja.status).toBe(200);

    // Act
    const respuesta = await admin.patch(`/api/usuarios/${idUsuario}/estado`).send({ activo: true });

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.activo).toBe(true);
    const sesion = await iniciarSesion(app, credenciales);
    expect(sesion.usuario.rol).toBe('Administrador');
  });

  it('la bitácora registra la creación del usuario sin su contraseña ni su hash', async () => {
    // Arrange
    const { idUsuario } = await crearUsuario();

    // Act
    const bitacora = await admin
      .get('/api/bitacora')
      .query({ modulo: 'Usuarios', idRegistro: idUsuario, accion: 'CREAR' });

    // Assert
    expect(bitacora.status).toBe(200);
    expect(bitacora.body.total).toBe(1);
    const entrada = bitacora.body.items[0] as {
      idUsuario: number;
      valorAnterior: unknown;
      valorNuevo: Record<string, unknown>;
    };
    expect(entrada.idUsuario).toBe(idAdmin);
    expect(entrada.valorAnterior).toBeNull();
    expect(entrada.valorNuevo).toMatchObject({ Rol: 'Operador' });
    expect(Object.keys(entrada.valorNuevo).join(',')).not.toMatch(/hash|contrasena/i);
    expect(JSON.stringify(entrada.valorNuevo)).not.toContain(CONTRASENA);
    expect(JSON.stringify(entrada.valorNuevo)).not.toContain('$argon2');
  });

  it('el cambio de contraseña queda en la bitácora solo como {"ContrasenaCambiada":true}', async () => {
    // Arrange
    const cliente = await registrarCliente(app);
    const nueva = 'NuevaClave2028';
    const cambio = await clienteHttp(app, cliente)
      .put('/api/perfil/contrasena')
      .send({ contrasenaActual: cliente.credenciales.contrasena, contrasenaNueva: nueva });
    expect(cambio.status).toBe(204);

    // Act
    const bitacora = await admin
      .get('/api/bitacora')
      .query({ modulo: 'Usuarios', idRegistro: cliente.usuario.idUsuario, accion: 'MODIFICAR' });

    // Assert
    expect(bitacora.status).toBe(200);
    // Dos entradas: crear la contraseña con el enlace del registro y este cambio.
    expect(bitacora.body.total).toBe(2);
    for (const entrada of bitacora.body.items as { valorNuevo: unknown }[]) {
      expect(entrada.valorNuevo).toEqual({ ContrasenaCambiada: true });
      expect(JSON.stringify(entrada)).not.toContain(nueva);
    }
  });

  it('valida el body del estado (400)', async () => {
    // Arrange
    const { idUsuario } = await crearUsuario();

    // Act
    const respuesta = await admin.patch(`/api/usuarios/${idUsuario}/estado`).send({ activo: 'no' });

    // Assert
    expect(respuesta.status).toBe(400);
  });
});
