import type { RequestHandler } from 'express';
import { AppError } from '../shared/errors/AppError.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError('NO_ENCONTRADO', `No existe la ruta ${req.method} ${req.path}.`));
};
