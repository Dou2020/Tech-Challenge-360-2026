import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { crearCliente } from '../test/fixtures/usuarios';
import { crearAuth } from '../test/renderizar';
import { AuthContext } from './authContext';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  it('dentro de un proveedor → devuelve el contexto', () => {
    // Arrange
    const auth = crearAuth({ usuario: crearCliente(), estado: 'autenticado' });
    const Envoltura = ({ children }: { children: ReactNode }) => (
      <AuthContext value={auth}>{children}</AuthContext>
    );

    // Act
    const { result } = renderHook(() => useAuth(), { wrapper: Envoltura });

    // Assert
    expect(result.current).toBe(auth);
  });

  it('fuera de un proveedor → lanza un error claro', () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Act & Assert
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth debe usarse dentro de <AuthProvider>.',
    );
    vi.restoreAllMocks();
  });
});
