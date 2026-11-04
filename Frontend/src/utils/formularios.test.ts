import type { UseFormSetError } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../services/http';
import { aplicarErroresApi } from './formularios';

interface Datos {
  correo: string;
  telefono: string;
}
const CAMPOS = ['correo', 'telefono'] as const;

describe('aplicarErroresApi', () => {
  it('details con campos conocidos → los asigna con su mensaje y devuelve true', () => {
    // Arrange
    const setError = vi.fn() as unknown as UseFormSetError<Datos>;
    const error = new ApiError(400, 'VALIDACION', 'Datos inválidos', [
      { field: 'correo', message: 'Correo inválido.' },
      { field: 'telefono', message: 'Teléfono inválido.' },
    ]);

    // Act
    const aplicado = aplicarErroresApi(error, setError, CAMPOS);

    // Assert
    expect(aplicado).toBe(true);
    expect(setError).toHaveBeenCalledWith('correo', {
      type: 'server',
      message: 'Correo inválido.',
    });
    expect(setError).toHaveBeenCalledWith('telefono', {
      type: 'server',
      message: 'Teléfono inválido.',
    });
  });

  it('details de un campo desconocido → los ignora y devuelve false', () => {
    // Arrange
    const setError = vi.fn() as unknown as UseFormSetError<Datos>;
    const error = new ApiError(400, 'VALIDACION', 'Datos inválidos', [
      { field: 'otro', message: 'No existe.' },
    ]);

    // Act
    const aplicado = aplicarErroresApi(error, setError, CAMPOS);

    // Assert
    expect(aplicado).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it('ApiError sin details → devuelve false', () => {
    // Arrange
    const setError = vi.fn() as unknown as UseFormSetError<Datos>;

    // Act
    const aplicado = aplicarErroresApi(
      new ApiError(500, 'ERROR_INTERNO', 'Error'),
      setError,
      CAMPOS,
    );

    // Assert
    expect(aplicado).toBe(false);
  });

  it('error que no es ApiError → devuelve false', () => {
    // Arrange
    const setError = vi.fn() as unknown as UseFormSetError<Datos>;

    // Act
    const aplicado = aplicarErroresApi(new Error('red'), setError, CAMPOS);

    // Assert
    expect(aplicado).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
