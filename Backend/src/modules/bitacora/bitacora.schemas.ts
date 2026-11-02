import { z } from 'zod';
import { esquemaId, filtroTexto } from '../../shared/utils/esquemas.js';
import { filtroFecha, rangoValido } from '../../shared/utils/fechas.js';
import { camposPaginacion } from '../../shared/utils/paginacion.js';

export const listarBitacoraQuery = z
  .object({
    modulo: filtroTexto(50),
    entidad: filtroTexto(50),
    idRegistro: esquemaId.optional(),
    idUsuario: esquemaId.optional(),
    accion: filtroTexto(20),
    desde: filtroFecha,
    hasta: filtroFecha,
    ...camposPaginacion(['fecha', 'modulo', 'entidad', 'accion'], 'fecha:desc'),
  })
  .refine(({ desde, hasta }) => rangoValido(desde, hasta), {
    path: ['hasta'],
    message: 'Debe ser igual o posterior a desde.',
  });

export type ListarBitacoraQuery = z.infer<typeof listarBitacoraQuery>;
