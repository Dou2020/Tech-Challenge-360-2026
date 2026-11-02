import { z } from 'zod';
import { textoObligatorio, textoOpcional } from '../../shared/utils/esquemas.js';

/** Las longitudes coinciden con los parámetros de SP_Direcciones_Crear y _Actualizar. */
const MAX_ALIAS = 50;
const MAX_DESTINATARIO = 150;
const MAX_TELEFONO = 20;
const MAX_LINEA = 200;
const MAX_LUGAR = 100;
const MAX_CODIGO_POSTAL = 10;
const MAX_REFERENCIAS = 300;

/** Mismo formato que el teléfono del registro. */
const telefono = textoObligatorio(MAX_TELEFONO).regex(/^\+?[\d\s-]{8,20}$/, 'Teléfono inválido.');

/** Código postal de Guatemala: 5 dígitos (01001). Opcional. */
const codigoPostal = textoOpcional(MAX_CODIGO_POSTAL).refine(
  (valor) => valor === null || /^\d{5}$/.test(valor),
  'Debe tener 5 dígitos, por ejemplo 01001.',
);

/** POST y PUT (el PUT reemplaza todo: omitir un opcional lo borra). */
export const direccionBody = z.object({
  alias: textoObligatorio(MAX_ALIAS),
  nombreDestinatario: textoObligatorio(MAX_DESTINATARIO),
  telefono,
  linea1: textoObligatorio(MAX_LINEA),
  linea2: textoOpcional(MAX_LINEA),
  municipio: textoObligatorio(MAX_LUGAR),
  departamento: textoObligatorio(MAX_LUGAR),
  codigoPostal,
  referencias: textoOpcional(MAX_REFERENCIAS),
});

export type DireccionBody = z.infer<typeof direccionBody>;
