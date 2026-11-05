import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bitacoraApi,
  configuracionApi,
  cuponesApi,
  usuariosApi,
} from '../../services/api/administracion';
import {
  useActualizarCupon,
  useActualizarParametro,
  useActualizarUsuario,
  useBitacora,
  useCambiarEstadoCupon,
  useCambiarEstadoUsuario,
  useConfiguracion,
  useCrearCupon,
  useCrearUsuario,
  useCupon,
  useCupones,
  useEliminarCupon,
  useModulosBitacora,
  useReenviarInvitacion,
  useUsosCupon,
  useUsuarios,
} from './useAdministracion';

vi.mock('../../services/api/administracion', () => ({
  cuponesApi: {
    listar: vi.fn(),
    obtener: vi.fn(),
    usos: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
  },
  usuariosApi: {
    listar: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    reenviarInvitacion: vi.fn(),
  },
  bitacoraApi: { listar: vi.fn(), modulos: vi.fn() },
  configuracionApi: { listar: vi.fn(), actualizar: vi.fn() },
}));

function contexto() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
  return { Envoltura, invalidar };
}
const claves = (spy: ReturnType<typeof vi.spyOn>) =>
  (spy.mock.calls as unknown[][]).map((c) =>
    JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
  );

beforeEach(() => {
  for (const grupo of [cuponesApi, usuariosApi, bitacoraApi, configuracionApi])
    Object.values(grupo).forEach((fn) =>
      (fn as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({}),
    );
});

describe('useAdministracion: consultas', () => {
  it.each([
    ['useCupones', () => useCupones({ q: 'v' }), () => cuponesApi.listar, [{ q: 'v' }]],
    [
      'useUsuarios',
      () => useUsuarios({ rol: 'Operador' }),
      () => usuariosApi.listar,
      [{ rol: 'Operador' }],
    ],
    [
      'useBitacora',
      () => useBitacora({ modulo: 'X' }),
      () => bitacoraApi.listar,
      [{ modulo: 'X' }],
    ],
    ['useModulosBitacora', () => useModulosBitacora(), () => bitacoraApi.modulos, []],
    ['useConfiguracion', () => useConfiguracion(), () => configuracionApi.listar, []],
    ['useCupon', () => useCupon(3), () => cuponesApi.obtener, [3]],
    ['useUsosCupon', () => useUsosCupon(3, { page: 2 }), () => cuponesApi.usos, [3, { page: 2 }]],
  ] as const)('%s → llama a la API con sus parámetros', async (_n, usar, fn, args) => {
    // Arrange
    const { Envoltura } = contexto();

    // Act
    const { result } = renderHook(() => usar(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    if (args.length === 0) expect(fn()).toHaveBeenCalledTimes(1);
    else expect(fn()).toHaveBeenCalledWith(...args);
  });

  it.each([0, -1, Number.NaN])('useCupon y useUsosCupon con id %s → no consultan', (id) => {
    // Arrange
    const { Envoltura } = contexto();

    // Act
    renderHook(() => useCupon(id), { wrapper: Envoltura });
    renderHook(() => useUsosCupon(id, {}), { wrapper: Envoltura });

    // Assert
    expect(cuponesApi.obtener).not.toHaveBeenCalled();
    expect(cuponesApi.usos).not.toHaveBeenCalled();
  });
});

describe('useAdministracion: mutaciones', () => {
  it.each([
    [
      'crear cupón',
      () => useCrearCupon(),
      { codigo: 'X' },
      () => cuponesApi.crear,
      [{ codigo: 'X' }],
    ],
    [
      'actualizar cupón',
      () => useActualizarCupon(3),
      { codigo: 'Y' },
      () => cuponesApi.actualizar,
      [3, { codigo: 'Y' }],
    ],
    [
      'estado cupón',
      () => useCambiarEstadoCupon(),
      { id: 3, activo: false },
      () => cuponesApi.cambiarEstado,
      [3, false],
    ],
    ['eliminar cupón', () => useEliminarCupon(), 3, () => cuponesApi.eliminar, [3]],
  ] as const)(
    '%s → llama a la API e invalida los cupones',
    async (_n, usar, variables, fn, args) => {
      // Arrange
      const { Envoltura, invalidar } = contexto();
      const { result } = renderHook(() => usar(), { wrapper: Envoltura });

      // Act
      result.current.mutate(variables as never);

      // Assert
      await waitFor(() => expect(fn()).toHaveBeenCalledWith(...args));
      await waitFor(() => expect(claves(invalidar)).toContain('["administracion","cupones"]'));
    },
  );

  it.each([
    [
      'crear usuario',
      () => useCrearUsuario(),
      { correo: 'a@b.gt' },
      () => usuariosApi.crear,
      [{ correo: 'a@b.gt' }],
    ],
    [
      'actualizar usuario',
      () => useActualizarUsuario(),
      { id: 2, datos: { nombre: 'N' } },
      () => usuariosApi.actualizar,
      [2, { nombre: 'N' }],
    ],
    [
      'reenviar invitación',
      () => useReenviarInvitacion(),
      2,
      () => usuariosApi.reenviarInvitacion,
      [2],
    ],
    [
      'estado usuario',
      () => useCambiarEstadoUsuario(),
      { id: 2, activo: true },
      () => usuariosApi.cambiarEstado,
      [2, true],
    ],
  ] as const)(
    '%s → llama a la API e invalida los usuarios',
    async (_n, usar, variables, fn, args) => {
      // Arrange
      const { Envoltura, invalidar } = contexto();
      const { result } = renderHook(() => usar(), { wrapper: Envoltura });

      // Act
      result.current.mutate(variables as never);

      // Assert
      await waitFor(() => expect(fn()).toHaveBeenCalledWith(...args));
      await waitFor(() => expect(claves(invalidar)).toContain('["administracion","usuarios"]'));
    },
  );

  it('actualizar un parámetro → invalida la configuración y también la bitácora', async () => {
    // Arrange
    const { Envoltura, invalidar } = contexto();
    const { result } = renderHook(() => useActualizarParametro(), { wrapper: Envoltura });

    // Act
    result.current.mutate({ clave: 'MinutosReserva', valor: '20' });

    // Assert
    await waitFor(() =>
      expect(configuracionApi.actualizar).toHaveBeenCalledWith('MinutosReserva', '20'),
    );
    await waitFor(() =>
      expect(claves(invalidar)).toEqual(
        expect.arrayContaining([
          '["administracion","configuracion"]',
          '["administracion","bitacora"]',
        ]),
      ),
    );
  });
});
