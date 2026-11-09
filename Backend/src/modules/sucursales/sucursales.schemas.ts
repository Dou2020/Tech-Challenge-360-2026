import { z } from 'zod';
import {
  booleanoQuery,
  codigoPostalOpcional,
  filtroTexto,
  telefonoObligatorio,
  textoObligatorio,
  textoOpcional,
} from '../../shared/utils/esquemas.js';
import { camposPaginacion } from '../../shared/utils/paginacion.js';

/** Las longitudes coinciden con los parámetros de SP_Sucursales_Crear y _Actualizar. */
const MAX_NOMBRE = 100;
const MAX_TELEFONO = 20;
const MAX_LINEA = 200;
const MAX_LUGAR = 100;
const MAX_CODIGO_POSTAL = 10;
const MAX_HORARIO = 200;

export const listarSucursalesQuery = z.object({
  q: filtroTexto(MAX_NOMBRE),
  activo: booleanoQuery,
  ...camposPaginacion(
    ['nombre', 'municipio', 'departamento', 'activo', 'cantidadPedidos'],
    'nombre:asc',
  ),
});

/** POST y PUT: en el PUT, omitir un campo opcional lo borra. */
export const sucursalBody = z.object({
  nombre: textoObligatorio(MAX_NOMBRE),
  telefono: telefonoObligatorio(MAX_TELEFONO),
  linea1: textoObligatorio(MAX_LINEA),
  linea2: textoOpcional(MAX_LINEA),
  municipio: textoObligatorio(MAX_LUGAR),
  departamento: textoObligatorio(MAX_LUGAR),
  codigoPostal: codigoPostalOpcional(MAX_CODIGO_POSTAL),
  horario: textoOpcional(MAX_HORARIO),
});

export const estadoSucursalBody = z.object({
  activo: z.boolean({ error: 'Debe ser true o false.' }),
});

export type ListarSucursalesQuery = z.infer<typeof listarSucursalesQuery>;
export type SucursalBody = z.infer<typeof sucursalBody>;
export type EstadoSucursalBody = z.infer<typeof estadoSucursalBody>;
