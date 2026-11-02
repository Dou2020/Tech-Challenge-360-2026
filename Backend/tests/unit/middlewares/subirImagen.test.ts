import { MulterError } from 'multer';
import { describe, expect, it } from 'vitest';
import { env } from '../../../src/config/env.js';
import { traducirErrorMulter } from '../../../src/middlewares/subirImagen.js';
import { AppError } from '../../../src/shared/errors/AppError.js';

describe('traducirErrorMulter', () => {
  it('LIMIT_FILE_SIZE se vuelve 413 ARCHIVO_DEMASIADO_GRANDE con el máximo en el mensaje', () => {
    // Act
    const error = traducirErrorMulter(new MulterError('LIMIT_FILE_SIZE', 'imagen')) as AppError;

    // Assert
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('ARCHIVO_DEMASIADO_GRANDE');
    expect(error.status).toBe(413);
    expect(error.message).toContain(`${env.IMAGENES_MAX_MB} MB`);
  });

  it.each([
    'LIMIT_UNEXPECTED_FILE',
    'LIMIT_FILE_COUNT',
    'LIMIT_FIELD_COUNT',
    'LIMIT_PART_COUNT',
  ] as const)('%s se vuelve 400 VALIDACION', (codigo) => {
    // Act
    const error = traducirErrorMulter(new MulterError(codigo, 'campo')) as AppError;

    // Assert
    expect(error.code).toBe('VALIDACION');
    expect(error.status).toBe(400);
    expect(error.details?.[0]?.field).toBe('campo');
  });

  it('deja pasar los errores que no son de multer', () => {
    // Arrange
    const original = new Error('otro');

    // Act & Assert
    expect(traducirErrorMulter(original)).toBe(original);
  });
});
