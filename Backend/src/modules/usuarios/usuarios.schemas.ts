import { z } from 'zod';
import { booleanoQuery, filtroTexto, paramsId } from '../../shared/utils/esquemas.js';
import { camposPaginacion } from '../../shared/utils/paginacion.js';
import { contrasenaNueva, correo, telefono, texto } from '../auth/auth.schemas.js';
import { ROLES } from '../auth/auth.types.js';

const MENSAJE_ROL = `Debe ser uno de: ${ROLES.join(', ')}.`;

export const listarUsuariosQuery = z.object({
  q: filtroTexto(100),
  rol: z.preprocess(
    (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
    z.enum(ROLES, { error: MENSAJE_ROL }).optional(),
  ),
  activo: booleanoQuery,
  ...camposPaginacion(['nombre', 'correo', 'rol', 'fechaCreacion'], 'nombre:asc'),
});

export const paramsUsuario = paramsId;

/** Solo se crean Operadores y Administradores: los Clientes se registran solos. */
export const crearUsuarioBody = z.object({
  correo,
  contrasena: contrasenaNueva,
  nombre: texto(100),
  apellido: texto(100),
  telefono,
  rol: z.enum(['Operador', 'Administrador'], { error: 'Debe ser Operador o Administrador.' }),
});

/** El correo no cambia. Sin `rol` se conserva; sin `telefono` se borra. */
export const actualizarUsuarioBody = z.object({
  nombre: texto(100),
  apellido: texto(100),
  telefono,
  rol: z.enum(ROLES, { error: MENSAJE_ROL }).optional(),
});

export const estadoUsuarioBody = z.object({
  activo: z.boolean({ error: 'Debe ser true o false.' }),
});

export type ListarUsuariosQuery = z.infer<typeof listarUsuariosQuery>;
export type CrearUsuarioBody = z.infer<typeof crearUsuarioBody>;
export type ActualizarUsuarioBody = z.infer<typeof actualizarUsuarioBody>;
export type EstadoUsuarioBody = z.infer<typeof estadoUsuarioBody>;
