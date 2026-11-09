import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  atributosApi,
  categoriasApi,
  productosApi,
  variantesApi,
} from '../../services/api/gestion';
import {
  useActualizarCategoria,
  useActualizarProducto,
  useActualizarVariante,
  useAgregarImagen,
  useAgregarValorAtributo,
  useAgregarVariante,
  useAtributos,
  useCambiarEstadoCategoria,
  useCambiarEstadoProducto,
  useCambiarEstadoVariante,
  useCambiarPrecioVariante,
  useCategoriasGestion,
  useCrearAtributo,
  useCrearCategoria,
  useCrearProducto,
  useEliminarCategoria,
  useEliminarProducto,
  useProductoGestion,
  useProductosGestion,
  useOrdenarImagenes,
  useQuitarImagen,
  useSubirImagen,
  useTodasLasCategorias,
} from './useGestion';

vi.mock('../../services/api/gestion', () => ({
  categoriasApi: {
    listar: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
  },
  productosApi: {
    listar: vi.fn(),
    obtener: vi.fn(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
    agregarImagen: vi.fn(),
    subirImagen: vi.fn(),
    quitarImagen: vi.fn(),
    ordenarImagenes: vi.fn(),
    agregarVariante: vi.fn(),
  },
  variantesApi: { actualizar: vi.fn(), cambiarPrecio: vi.fn(), cambiarEstado: vi.fn() },
  atributosApi: { listar: vi.fn(), crear: vi.fn(), agregarValor: vi.fn() },
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
  for (const grupo of [categoriasApi, productosApi, variantesApi, atributosApi])
    Object.values(grupo).forEach((fn) =>
      (fn as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({}),
    );
});

describe('useGestion: consultas', () => {
  it('useCategoriasGestion → pasa los parámetros', async () => {
    // Arrange
    const { Envoltura } = contexto();

    // Act
    const { result } = renderHook(() => useCategoriasGestion({ q: 'cam' }), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(categoriasApi.listar).toHaveBeenCalledWith({ q: 'cam' });
  });

  it('useTodasLasCategorias → pide hasta 100 ordenadas y devuelve solo los items', async () => {
    // Arrange
    vi.mocked(categoriasApi.listar).mockResolvedValue({
      items: [{ idCategoria: 1 }],
      page: 1,
      pageSize: 100,
      total: 1,
    } as never);
    const { Envoltura } = contexto();

    // Act
    const { result } = renderHook(() => useTodasLasCategorias(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.data).toEqual([{ idCategoria: 1 }]));
    expect(categoriasApi.listar).toHaveBeenCalledWith({ pageSize: 100, sort: 'nombre:asc' });
  });

  it('useProductosGestion y useProductoGestion → consultan; id inválido no consulta', async () => {
    // Arrange
    const { Envoltura } = contexto();

    // Act
    const lista = renderHook(() => useProductosGestion({ page: 1 }), { wrapper: Envoltura });
    const uno = renderHook(() => useProductoGestion(8), { wrapper: Envoltura });
    renderHook(() => useProductoGestion(0), { wrapper: Envoltura });

    // Assert
    await waitFor(() =>
      expect(lista.result.current.isSuccess && uno.result.current.isSuccess).toBe(true),
    );
    expect(productosApi.listar).toHaveBeenCalledWith({ page: 1 });
    expect(productosApi.obtener).toHaveBeenCalledTimes(1);
    expect(productosApi.obtener).toHaveBeenCalledWith(8);
  });

  it('useAtributos → lista los atributos', async () => {
    // Arrange
    const { Envoltura } = contexto();

    // Act
    const { result } = renderHook(() => useAtributos(), { wrapper: Envoltura });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(atributosApi.listar).toHaveBeenCalledTimes(1);
  });
});

describe('useGestion: mutaciones de categorías', () => {
  it.each([
    [
      'crear',
      () => useCrearCategoria(),
      { nombre: 'X' },
      () => categoriasApi.crear,
      [{ nombre: 'X' }],
    ],
    [
      'actualizar',
      () => useActualizarCategoria(),
      { id: 1, datos: { nombre: 'Y' } },
      () => categoriasApi.actualizar,
      [1, { nombre: 'Y' }],
    ],
    [
      'cambiarEstado',
      () => useCambiarEstadoCategoria(),
      { id: 1, activo: false },
      () => categoriasApi.cambiarEstado,
      [1, false],
    ],
    ['eliminar', () => useEliminarCategoria(), 1, () => categoriasApi.eliminar, [1]],
  ] as const)(
    '%s → llama a la API e invalida categorías, catálogo e inventario',
    async (_n, usar, variables, fn, args) => {
      // Arrange
      const { Envoltura, invalidar } = contexto();
      const { result } = renderHook(() => usar(), { wrapper: Envoltura });

      // Act
      result.current.mutate(variables as never);

      // Assert
      await waitFor(() => expect(fn()).toHaveBeenCalledWith(...args));
      await waitFor(() =>
        expect(claves(invalidar)).toEqual(
          expect.arrayContaining(['["gestion","categorias"]', '["catalogo"]', '["inventario"]']),
        ),
      );
    },
  );
});

describe('useGestion: mutaciones de productos y variantes', () => {
  it.each([
    [
      'crear',
      () => useCrearProducto(),
      { nombre: 'X' },
      () => productosApi.crear,
      [{ nombre: 'X' }],
    ],
    [
      'actualizar',
      () => useActualizarProducto(8),
      { nombre: 'Y' },
      () => productosApi.actualizar,
      [8, { nombre: 'Y' }],
    ],
    [
      'cambiarEstado',
      () => useCambiarEstadoProducto(8),
      true,
      () => productosApi.cambiarEstado,
      [8, true],
    ],
    ['eliminar', () => useEliminarProducto(8), undefined, () => productosApi.eliminar, [8]],
    [
      'agregarImagen',
      () => useAgregarImagen(8),
      { url: 'u' },
      () => productosApi.agregarImagen,
      [8, { url: 'u' }],
    ],
    [
      'subirImagen',
      () => useSubirImagen(8),
      { archivo: new File(['x'], 'f.png', { type: 'image/png' }), orden: 1, esPrincipal: true },
      () => productosApi.subirImagen,
      [8, { archivo: expect.any(File), orden: 1, esPrincipal: true }],
    ],
    [
      'ordenarImagenes',
      () => useOrdenarImagenes(8),
      [5, 4],
      () => productosApi.ordenarImagenes,
      [8, [5, 4]],
    ],
    ['quitarImagen', () => useQuitarImagen(8), 4, () => productosApi.quitarImagen, [8, 4]],
    [
      'agregarVariante',
      () => useAgregarVariante(8),
      { sku: 'S' },
      () => productosApi.agregarVariante,
      [8, { sku: 'S' }],
    ],
    [
      'actualizarVariante',
      () => useActualizarVariante(),
      { id: 17, sku: 'S', valores: [1] },
      () => variantesApi.actualizar,
      [17, { sku: 'S', valores: [1] }],
    ],
    [
      'cambiarPrecio',
      () => useCambiarPrecioVariante(),
      { id: 17, precio: '10.00' },
      () => variantesApi.cambiarPrecio,
      [17, '10.00'],
    ],
    [
      'cambiarEstadoVariante',
      () => useCambiarEstadoVariante(),
      { id: 17, activo: false },
      () => variantesApi.cambiarEstado,
      [17, false],
    ],
  ] as const)(
    '%s → llama a la API e invalida productos, atributos, catálogo e inventario',
    async (_n, usar, variables, fn, args) => {
      // Arrange
      const { Envoltura, invalidar } = contexto();
      const { result } = renderHook(() => usar(), { wrapper: Envoltura });

      // Act
      result.current.mutate(variables as never);

      // Assert
      await waitFor(() => expect(fn()).toHaveBeenCalledWith(...args));
      await waitFor(() =>
        expect(claves(invalidar)).toEqual(
          expect.arrayContaining([
            '["gestion","productos"]',
            '["gestion","atributos"]',
            '["catalogo"]',
            '["inventario"]',
          ]),
        ),
      );
    },
  );
});

describe('useGestion: atributos', () => {
  it('useCrearAtributo → crea e invalida los atributos', async () => {
    // Arrange
    const { Envoltura, invalidar } = contexto();
    const { result } = renderHook(() => useCrearAtributo(), { wrapper: Envoltura });

    // Act
    result.current.mutate('Talla');

    // Assert
    await waitFor(() => expect(atributosApi.crear).toHaveBeenCalledWith('Talla'));
    await waitFor(() => expect(claves(invalidar)).toContain('["gestion","atributos"]'));
  });

  it('useAgregarValorAtributo → agrega el valor e invalida los atributos', async () => {
    // Arrange
    const { Envoltura, invalidar } = contexto();
    const { result } = renderHook(() => useAgregarValorAtributo(), { wrapper: Envoltura });

    // Act
    result.current.mutate({ idAtributo: 1, valor: 'XL' });

    // Assert
    await waitFor(() => expect(atributosApi.agregarValor).toHaveBeenCalledWith(1, 'XL'));
    await waitFor(() => expect(claves(invalidar)).toContain('["gestion","atributos"]'));
  });
});
