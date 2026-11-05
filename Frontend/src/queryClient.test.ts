import { describe, expect, it } from 'vitest';
import { queryClient } from './queryClient';
import { ApiError } from './services/http';

type Reintento = (intentos: number, error: unknown) => boolean;
const reintentar = queryClient.getDefaultOptions().queries!.retry as Reintento;

describe('queryClient', () => {
  it('conserva los datos 30 segundos como frescos', () => {
    // Act & Assert
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it.each([400, 401, 403, 404, 409, 422, 429])('un %i no se reintenta', (status) => {
    // Act & Assert
    expect(reintentar(0, new ApiError(status, 'X', 'x'))).toBe(false);
  });

  it.each([500, 503])('un %i se reintenta hasta 2 veces', (status) => {
    // Act & Assert
    expect(reintentar(0, new ApiError(status, 'X', 'x'))).toBe(true);
    expect(reintentar(1, new ApiError(status, 'X', 'x'))).toBe(true);
    expect(reintentar(2, new ApiError(status, 'X', 'x'))).toBe(false);
  });

  it('un fallo de red (SIN_CONEXION) o un error cualquiera se reintenta', () => {
    // Act & Assert
    expect(reintentar(0, new ApiError(0, 'SIN_CONEXION', 'x'))).toBe(true);
    expect(reintentar(0, new Error('boom'))).toBe(true);
  });
});
