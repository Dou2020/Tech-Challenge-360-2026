import { describe, expect, it } from 'vitest';
import {
  hashearContrasena,
  verificarContraHashFicticio,
  verificarContrasena,
} from '../../../../src/shared/utils/contrasenas.js';

describe('contrasenas', () => {
  it('un hash corrupto cuenta como contraseña inválida', async () => {
    // Arrange
    const hashCorrupto = 'no-es-un-hash-argon2';

    // Act
    const valida = await verificarContrasena(hashCorrupto, 'Cliente#2026');

    // Assert
    expect(valida).toBe(false);
  });

  it('hashear y verificar: la correcta pasa y otra no', async () => {
    // Arrange
    const hash = await hashearContrasena('Cliente#2026');

    // Act
    const [correcta, incorrecta] = await Promise.all([
      verificarContrasena(hash, 'Cliente#2026'),
      verificarContrasena(hash, 'Otra#2026'),
    ]);

    // Assert
    expect(hash).not.toContain('Cliente#2026');
    expect([correcta, incorrecta]).toEqual([true, false]);
  });

  it('verificarContraHashFicticio siempre resuelve false', async () => {
    // Act
    const resultado = await verificarContraHashFicticio('cualquiera');

    // Assert
    expect(resultado).toBe(false);
  });
});
