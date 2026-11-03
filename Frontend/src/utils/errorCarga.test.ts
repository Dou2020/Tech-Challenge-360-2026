import { describe, expect, it } from 'vitest';
import { esErrorDeCarga } from './errorCarga';

describe('esErrorDeCarga', () => {
  it.each([
    ['ChunkLoadError', 'Loading chunk 7 failed'],
    ['TypeError', 'Failed to fetch dynamically imported module: https://x.test/a.js'],
    ['TypeError', 'Importing a module script failed.'],
    ['Error', 'Loading chunk 12 failed.'],
  ])('error de descarga de chunk (%s: %s) → true', (nombre, mensaje) => {
    // Arrange
    const error = Object.assign(new Error(mensaje), { name: nombre });

    // Act
    const resultado = esErrorDeCarga(error);

    // Assert
    expect(resultado).toBe(true);
  });

  it.each([
    ['error normal', new Error('Algo falló')],
    ['cadena', 'Failed to fetch dynamically imported module'],
    ['null', null],
    ['objeto sin Error', { message: 'ChunkLoadError' }],
  ])('%s → false', (_nombre, error) => {
    // Act
    const resultado = esErrorDeCarga(error);

    // Assert
    expect(resultado).toBe(false);
  });
});
