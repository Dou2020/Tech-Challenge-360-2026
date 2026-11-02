import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../shared/errors/AppError.js';

const MB = 1024 * 1024;

/**
 * Recibe una imagen multipart en el campo `imagen` (más campos de texto) y la deja en
 * `req.file.buffer`. Memoria, no disco: el archivo solo se escribe después de comprobar su tipo.
 * Límites: IMAGENES_MAX_MB por archivo, 1 archivo, 5 campos de texto.
 * No valida el contenido: eso lo hace `imagenes.guardar` con los bytes mágicos.
 */
const cargador = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.floor(env.IMAGENES_MAX_MB * MB),
    files: 1,
    fields: 5,
    fieldSize: 1024,
    parts: 7,
  },
}).single('imagen');

/** Traduce los errores de multer al formato de error de la API. */
export function traducirErrorMulter(error: unknown): unknown {
  if (!(error instanceof MulterError)) return error;
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new AppError(
      'ARCHIVO_DEMASIADO_GRANDE',
      `La imagen supera el máximo de ${env.IMAGENES_MAX_MB} MB.`,
    );
  }
  const mensajes: Record<string, string> = {
    LIMIT_UNEXPECTED_FILE: 'Envía un solo archivo en el campo "imagen".',
    LIMIT_FILE_COUNT: 'Envía un solo archivo en el campo "imagen".',
  };
  return new AppError('VALIDACION', mensajes[error.code] ?? 'La subida del archivo no es válida.', [
    { field: error.field ?? 'imagen', message: mensajes[error.code] ?? error.message },
  ]);
}

export const subirImagen: RequestHandler = (req, res, next) => {
  cargador(req, res, (error: unknown) => next(error ? traducirErrorMulter(error) : undefined));
};
