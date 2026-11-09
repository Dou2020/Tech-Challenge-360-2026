import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sucursalesApi, sucursalesPublicasApi } from '../../services/api/sucursales';
import { crearSucursalGestion, crearSucursalPublica } from '../../test/fixtures/sucursales';
import type { DatosSucursal } from '../../types/sucursales';
import {
  CLAVE_SUCURSALES_GESTION,
  CLAVE_SUCURSALES_PUBLICAS,
  useActualizarSucursal,
  useCambiarEstadoSucursal,
  useCrearSucursal,
  useEliminarSucursal,
  useSucursalesGestion,
  useSucursalesPublicas,
} from './useSucursales';

vi.mock('../../services/api/sucursales', () => ({
  sucursalesApi: {
    listar: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
  },
  sucursalesPublicasApi: { listar: vi.fn() },
}));
const api = vi.mocked(sucursalesApi);
const publica = vi.mocked(sucursalesPublicasApi.listar);

const datos: DatosSucursal = {
  nombre: 'Zona 10',
  telefono: '22334455',
  linea1: '6a avenida 12-34',
  municipio: 'Guatemala',
  departamento: 'Guatemala',
};

function contexto() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Envoltura, queryClient };
}

describe('useSucursales', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    publica.mockReset();
    api.crear.mockResolvedValue(crearSucursalGestion());
    api.actualizar.mockResolvedValue(crearSucursalGestion());
    api.cambiarEstado.mockResolvedValue(crearSucursalGestion());
    api.eliminar.mockResolvedValue(undefined);
  });

  it('useSucursalesPublicas → pide la lista pública bajo ["catalogo","sucursales"] con staleTime de 5 minutos', async () => {
    // Arrange
    const lista = [crearSucursalPublica()];
    publica.mockResolvedValue(lista);
    const { Envoltura, queryClient } = contexto();

    // Act
    const { result } = renderHook(() => useSucursalesPublicas(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(lista));
    expect(CLAVE_SUCURSALES_PUBLICAS).toEqual(['catalogo', 'sucursales']);
    const consulta = queryClient.getQueryCache().find({ queryKey: CLAVE_SUCURSALES_PUBLICAS });
    expect(consulta?.observers[0]?.options.staleTime).toBe(5 * 60_000);
  });

  it('useSucursalesGestion → manda los parámetros a la API bajo ["gestion","sucursales", params]', async () => {
    // Arrange
    const pagina = { items: [crearSucursalGestion()], page: 1, pageSize: 20, total: 1 };
    api.listar.mockResolvedValue(pagina);
    const params = { q: 'zona', page: 1, pageSize: 20 };
    const { Envoltura, queryClient } = contexto();

    // Act
    const { result } = renderHook(() => useSucursalesGestion(params), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual(pagina));
    expect(api.listar).toHaveBeenCalledWith(params);
    expect(CLAVE_SUCURSALES_GESTION).toEqual(['gestion', 'sucursales']);
    expect(queryClient.getQueryData([...CLAVE_SUCURSALES_GESTION, params])).toEqual(pagina);
  });

  it.each([
    [
      'crear',
      () => {
        const m = useCrearSucursal();
        return (): Promise<unknown> => m.mutateAsync(datos);
      },
      () => expect(api.crear).toHaveBeenCalledWith(datos),
    ],
    [
      'actualizar',
      () => {
        const m = useActualizarSucursal();
        return (): Promise<unknown> => m.mutateAsync({ id: 3, datos });
      },
      () => expect(api.actualizar).toHaveBeenCalledWith(3, datos),
    ],
    [
      'cambiar estado',
      () => {
        const m = useCambiarEstadoSucursal();
        return (): Promise<unknown> => m.mutateAsync({ id: 3, activo: false });
      },
      () => expect(api.cambiarEstado).toHaveBeenCalledWith(3, false),
    ],
    [
      'eliminar',
      () => {
        const m = useEliminarSucursal();
        return (): Promise<unknown> => m.mutateAsync(3);
      },
      () => expect(api.eliminar).toHaveBeenCalledWith(3),
    ],
  ])(
    '%s con éxito → llama al servicio e invalida la clave de gestión y la pública',
    async (_nombre, usar, verificarLlamada) => {
      // Arrange
      const { Envoltura, queryClient } = contexto();
      const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(usar, { wrapper: Envoltura });

      // Act
      await act(async () => {
        await result.current();
      });

      // Assert
      verificarLlamada();
      await waitFor(() => expect(invalidar).toHaveBeenCalledTimes(2));
      expect(invalidar).toHaveBeenCalledWith({ queryKey: CLAVE_SUCURSALES_GESTION });
      expect(invalidar).toHaveBeenCalledWith({ queryKey: CLAVE_SUCURSALES_PUBLICAS });
    },
  );

  it('una mutación que falla → no invalida nada', async () => {
    // Arrange
    api.eliminar.mockRejectedValue(new Error('falla'));
    const { Envoltura, queryClient } = contexto();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useEliminarSucursal(), { wrapper: Envoltura });

    // Act
    await act(async () => {
      await result.current.mutateAsync(3).catch(() => undefined);
    });

    // Assert
    expect(invalidar).not.toHaveBeenCalled();
  });
});
