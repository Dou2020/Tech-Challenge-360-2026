import { z } from 'zod';
import {
  codigoPostalOpcional,
  telefonoObligatorio,
  textoObligatorio,
  textoOpcional,
} from '../../shared/utils/esquemas.js';

/** Las longitudes coinciden con los parámetros de SP_Direcciones_Crear y _Actualizar. */
const MAX_ALIAS = 50;
const MAX_DESTINATARIO = 150;
const MAX_TELEFONO = 20;
const MAX_LINEA = 200;
const MAX_LUGAR = 100;
const MAX_CODIGO_POSTAL = 10;
const MAX_REFERENCIAS = 300;

const telefono = telefonoObligatorio(MAX_TELEFONO);
const codigoPostal = codigoPostalOpcional(MAX_CODIGO_POSTAL);

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
