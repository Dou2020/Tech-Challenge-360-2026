import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/authContext';
import { escucharEventosPedidos } from '../services/eventosPedidos';
import { crearAdmin, crearCliente, crearOperador } from '../test/fixtures/usuarios';
import { crearAuth } from '../test/renderizar';
import type { Usuario } from '../types/auth';
import type { EventoPedido } from '../types/pedidos';
import { clavesAfectadas, ESPERA_AGRUPAR_MS, useTiempoRealPedidos } from './useTiempoRealPedidos';

vi.mock('../services/eventosPedidos', () => ({ escucharEventosPedidos: vi.fn() }));
const escuchar = vi.mocked(escucharEventosPedidos);

type OpcionesEscucha = Parameters<typeof escucharEventosPedidos>[0];
const opciones = (): OpcionesEscucha => escuchar.mock.calls.at(-1)![0];

const evento = (tipo: EventoPedido['tipo']): EventoPedido => ({
  tipo,
  idPedido: 1503,
  idUsuario: 6,
  estado: 'EN_PREPARACION',
  fecha: '2026-11-08T12:00:00.000Z',
});

function montar(usuario: Usuario | null, activo = true) {
  const queryClient = new QueryClient();
  const invalidar = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext value={crearAuth({ usuario, estado: usuario ? 'autenticado' : 'anonimo' })}>
        {children}
      </AuthContext>
    </QueryClientProvider>
  );
  const vista = renderHook(() => useTiempoRealPedidos(activo), { wrapper: Envoltura });
  const claves = () =>
    invalidar.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
  return { ...vista, invalidar, claves };
}

beforeEach(() => {
  vi.useFakeTimers();
  escuchar.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('clavesAfectadas', () => {
  it.each([
    ['Cliente', 'CANCELADO', ['["pedidos"]']],
    ['Operador', 'ESTADO', ['["pedidos"]']],
    ['Operador', 'DEVOLUCION', ['["pedidos"]', '["inventario"]']],
    ['Administrador', 'ESTADO', ['["pedidos"]', '["reportes"]']],
    ['Administrador', 'CREADO', ['["pedidos"]', '["inventario"]', '["reportes"]']],
    ['Operador', undefined, ['["pedidos"]', '["inventario"]']],
  ] as const)('%s con %s → %j', (rol, tipo, esperado) => {
    // Act
    const claves = clavesAfectadas(rol, tipo);

    // Assert
    expect(claves.map((c) => JSON.stringify(c))).toEqual(esperado);
  });
});

describe('useTiempoRealPedidos', () => {
  it('inactivo o sin usuario → no abre el stream', () => {
    // Act
    montar(crearOperador(), false);
    montar(null);

    // Assert
    expect(escuchar).not.toHaveBeenCalled();
  });

  it('un evento → invalida las consultas afectadas después de agruparlas', async () => {
    // Arrange
    const { invalidar, claves } = montar(crearAdmin());

    // Act
    act(() => opciones().onEvento(evento('CANCELADO')));

    // Assert
    expect(invalidar).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(ESPERA_AGRUPAR_MS));
    expect(claves()).toEqual(['["pedidos"]', '["inventario"]', '["reportes"]']);
  });

  it('varios eventos seguidos → cada consulta se invalida una sola vez', async () => {
    // Arrange
    const { claves } = montar(crearOperador());

    // Act
    act(() => {
      opciones().onEvento(evento('ESTADO'));
      opciones().onEvento(evento('ESTADO'));
      opciones().onEvento(evento('CREADO'));
    });
    await act(() => vi.advanceTimersByTimeAsync(ESPERA_AGRUPAR_MS));

    // Assert
    expect(claves()).toEqual(['["pedidos"]', '["inventario"]']);
  });

  it('el Cliente solo refresca sus pedidos', async () => {
    // Arrange
    const { claves } = montar(crearCliente());

    // Act
    act(() => opciones().onEvento(evento('CANCELADO')));
    await act(() => vi.advanceTimersByTimeAsync(ESPERA_AGRUPAR_MS));

    // Assert
    expect(claves()).toEqual(['["pedidos"]']);
  });

  it('la primera conexión no refresca; una reconexión sí (pudo perder eventos)', async () => {
    // Arrange
    const { invalidar, claves } = montar(crearOperador());
    act(() => opciones().onConectado?.());
    await act(() => vi.advanceTimersByTimeAsync(ESPERA_AGRUPAR_MS));
    expect(invalidar).not.toHaveBeenCalled();

    // Act
    act(() => opciones().onConectado?.());
    await act(() => vi.advanceTimersByTimeAsync(ESPERA_AGRUPAR_MS));

    // Assert
    expect(claves()).toEqual(['["pedidos"]', '["inventario"]']);
  });

  it('al desmontar → aborta el stream y descarta lo pendiente', async () => {
    // Arrange
    const { unmount, invalidar } = montar(crearOperador());
    const { signal } = opciones();
    act(() => opciones().onEvento(evento('ESTADO')));

    // Act
    unmount();
    await vi.advanceTimersByTimeAsync(ESPERA_AGRUPAR_MS);

    // Assert
    expect(signal.aborted).toBe(true);
    expect(invalidar).not.toHaveBeenCalled();
  });
});
