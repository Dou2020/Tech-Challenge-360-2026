/**
 * Ayudas de autenticación para las pruebas de integración: credenciales de la semilla,
 * login por rol, registro de clientes desechables y un cliente HTTP con el Bearer puesto.
 *
 * Redis y la base se comparten entre archivos de integración: usa correoUnico() para los
 * usuarios que se bloquean, desactivan o modifican, y deja los de la semilla intactos.
 */
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request, { type Response, type Test } from 'supertest';
import { expect } from 'vitest';
import type { Rol } from '../../src/shared/types/express.js';

export interface Credenciales {
  correo: string;
  contrasena: string;
}

/** Usuarios de Database/scripts/090_datos_semilla.sql. */
export const USUARIOS_SEMILLA = {
  admin: { correo: 'admin@shopcart.gt', contrasena: 'Admin#2026' },
  operador: { correo: 'operador@shopcart.gt', contrasena: 'Operador#2026' },
  cliente: { correo: 'cliente@shopcart.gt', contrasena: 'Cliente#2026' },
  cliente2: { correo: 'cliente2@shopcart.gt', contrasena: 'Cliente#2026' },
  /** Activo = 0: el login responde 403 USUARIO_INACTIVO. */
  inactivo: { correo: 'inactivo@shopcart.gt', contrasena: 'Cliente#2026' },
} as const satisfies Record<string, Credenciales>;

export type UsuarioSemilla = Exclude<keyof typeof USUARIOS_SEMILLA, 'inactivo'>;

export interface Sesion {
  accessToken: string;
  /** Cookie lista para el header Cookie: `refreshToken=…`. */
  cookieRefresh: string;
  usuario: { idUsuario: number; nombre: string; apellido: string; correo: string; rol: Rol };
}

/** Correo que no choca con otros archivos ni con ejecuciones anteriores. */
export function correoUnico(prefijo = 'cliente'): string {
  return `${prefijo}.${randomUUID().slice(0, 8)}@prueba.gt`;
}

/** Valor `refreshToken=…` del Set-Cookie de la respuesta, o undefined. */
export function cookieRefresh(respuesta: Response): string | undefined {
  const encabezado = respuesta.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(encabezado) ? (encabezado as string[]) : [];
  const cookie = cookies.find((valor) => valor.startsWith('refreshToken='));
  const par = cookie?.split(';')[0];
  return par && par !== 'refreshToken=' ? par : undefined;
}

function aSesion(respuesta: Response): Sesion {
  const cookie = cookieRefresh(respuesta);
  expect(cookie, 'la respuesta no trae la cookie refreshToken').toBeDefined();
  return {
    accessToken: respuesta.body.accessToken as string,
    cookieRefresh: cookie!,
    usuario: respuesta.body.usuario as Sesion['usuario'],
  };
}

export async function iniciarSesion(app: Express, credenciales: Credenciales): Promise<Sesion> {
  const respuesta = await request(app).post('/api/auth/login').send(credenciales);
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
  return aSesion(respuesta);
}

/** Login con un usuario de la semilla: iniciarSesionComo(app, 'admin'). */
export function iniciarSesionComo(app: Express, usuario: UsuarioSemilla): Promise<Sesion> {
  return iniciarSesion(app, USUARIOS_SEMILLA[usuario]);
}

export interface DatosClienteNuevo extends Credenciales {
  nombre: string;
  apellido: string;
  telefono?: string | null;
}

/** Registra un Cliente con correo único y devuelve su sesión y sus credenciales. */
export async function registrarCliente(
  app: Express,
  datos: Partial<DatosClienteNuevo> = {},
): Promise<Sesion & { credenciales: Credenciales }> {
  const cuerpo: DatosClienteNuevo = {
    correo: correoUnico(),
    contrasena: 'Prueba#2026',
    nombre: 'Cliente',
    apellido: 'De Prueba',
    telefono: '5555-0000',
    ...datos,
  };
  const respuesta = await request(app).post('/api/auth/registro').send(cuerpo);
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
  return {
    ...aSesion(respuesta),
    credenciales: { correo: cuerpo.correo, contrasena: cuerpo.contrasena },
  };
}

/** Cliente HTTP que agrega `Authorization: Bearer <token>` a cada petición. */
export function clienteHttp(app: Express, sesionOToken: Sesion | string) {
  const token = typeof sesionOToken === 'string' ? sesionOToken : sesionOToken.accessToken;
  const autorizar = (prueba: Test) => prueba.set('Authorization', `Bearer ${token}`);
  const agente = request(app);
  return {
    get: (ruta: string) => autorizar(agente.get(ruta)),
    post: (ruta: string) => autorizar(agente.post(ruta)),
    put: (ruta: string) => autorizar(agente.put(ruta)),
    patch: (ruta: string) => autorizar(agente.patch(ruta)),
    delete: (ruta: string) => autorizar(agente.delete(ruta)),
  };
}

/** Atajo: login con un usuario de la semilla y su cliente HTTP autenticado. */
export async function clienteComo(app: Express, usuario: UsuarioSemilla) {
  const sesion = await iniciarSesionComo(app, usuario);
  return { sesion, http: clienteHttp(app, sesion) };
}
