import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  atributosApi,
  categoriasApi,
  productosApi,
  variantesApi,
} from '../../services/api/gestion';
import type {
  DatosCategoria,
  DatosImagen,
  DatosImagenArchivo,
  DatosProducto,
  DatosProductoNuevo,
  DatosVarianteNueva,
} from '../../types/gestion';

/** Todo lo de gestión cuelga de ['gestion']; el catálogo público, de ['catalogo']. */
export const CLAVE_CATEGORIAS_GESTION = ['gestion', 'categorias'] as const;
export const CLAVE_PRODUCTOS_GESTION = ['gestion', 'productos'] as const;
export const CLAVE_ATRIBUTOS = ['gestion', 'atributos'] as const;

type Params = Record<string, string | number | undefined>;

/** Cambiar categorías, productos o precios también cambia la tienda y el inventario. */
function refrescarCatalogo(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['catalogo'] });
  void queryClient.invalidateQueries({ queryKey: ['inventario'] });
}

// --- Categorías -----------------------------------------------------------------

export function useCategoriasGestion(params: Params) {
  return useQuery({
    queryKey: [...CLAVE_CATEGORIAS_GESTION, params],
    queryFn: () => categoriasApi.listar(params),
    placeholderData: keepPreviousData,
  });
}

/** Todas las categorías (activas e inactivas) para un selector; hasta 100. */
export function useTodasLasCategorias() {
  return useQuery({
    queryKey: [...CLAVE_CATEGORIAS_GESTION, 'todas'],
    queryFn: () => categoriasApi.listar({ pageSize: 100, sort: 'nombre:asc' }),
    select: (pagina) => pagina.items,
    staleTime: 60_000,
  });
}

function useMutacionCategoria<V, R>(fn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_CATEGORIAS_GESTION });
      refrescarCatalogo(queryClient);
    },
  });
}

export const useCrearCategoria = () =>
  useMutacionCategoria((datos: DatosCategoria) => categoriasApi.crear(datos));
export const useActualizarCategoria = () =>
  useMutacionCategoria(({ id, datos }: { id: number; datos: DatosCategoria }) =>
    categoriasApi.actualizar(id, datos),
  );
export const useCambiarEstadoCategoria = () =>
  useMutacionCategoria(({ id, activo }: { id: number; activo: boolean }) =>
    categoriasApi.cambiarEstado(id, activo),
  );
export const useEliminarCategoria = () =>
  useMutacionCategoria((id: number) => categoriasApi.eliminar(id));

// --- Productos ------------------------------------------------------------------

export function useProductosGestion(params: Params) {
  return useQuery({
    queryKey: [...CLAVE_PRODUCTOS_GESTION, 'lista', params],
    queryFn: () => productosApi.listar(params),
    placeholderData: keepPreviousData,
  });
}

export function useProductoGestion(id: number) {
  return useQuery({
    queryKey: [...CLAVE_PRODUCTOS_GESTION, 'detalle', id],
    queryFn: () => productosApi.obtener(id),
    enabled: Number.isInteger(id) && id > 0,
    staleTime: 0,
  });
}

function useMutacionProducto<V, R>(fn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_PRODUCTOS_GESTION });
      // El atributo muestra cuántas variantes usan cada valor.
      void queryClient.invalidateQueries({ queryKey: CLAVE_ATRIBUTOS });
      refrescarCatalogo(queryClient);
    },
  });
}

export const useCrearProducto = () =>
  useMutacionProducto((datos: DatosProductoNuevo) => productosApi.crear(datos));
export const useActualizarProducto = (id: number) =>
  useMutacionProducto((datos: DatosProducto) => productosApi.actualizar(id, datos));
export const useCambiarEstadoProducto = (id: number) =>
  useMutacionProducto((activo: boolean) => productosApi.cambiarEstado(id, activo));
export const useEliminarProducto = (id: number) =>
  useMutacionProducto(() => productosApi.eliminar(id));
export const useAgregarImagen = (id: number) =>
  useMutacionProducto((datos: DatosImagen) => productosApi.agregarImagen(id, datos));
export const useSubirImagen = (id: number) =>
  useMutacionProducto((datos: DatosImagenArchivo) => productosApi.subirImagen(id, datos));
export const useQuitarImagen = (id: number) =>
  useMutacionProducto((idImagen: number) => productosApi.quitarImagen(id, idImagen));
export const useAgregarVariante = (id: number) =>
  useMutacionProducto((datos: DatosVarianteNueva) => productosApi.agregarVariante(id, datos));
export const useActualizarVariante = () =>
  useMutacionProducto(({ id, sku, valores }: { id: number; sku: string; valores: number[] }) =>
    variantesApi.actualizar(id, { sku, valores }),
  );
export const useCambiarPrecioVariante = () =>
  useMutacionProducto(({ id, precio }: { id: number; precio: string }) =>
    variantesApi.cambiarPrecio(id, precio),
  );
export const useCambiarEstadoVariante = () =>
  useMutacionProducto(({ id, activo }: { id: number; activo: boolean }) =>
    variantesApi.cambiarEstado(id, activo),
  );

// --- Atributos ------------------------------------------------------------------

export function useAtributos() {
  return useQuery({
    queryKey: CLAVE_ATRIBUTOS,
    queryFn: atributosApi.listar,
    staleTime: 60_000,
  });
}

export function useCrearAtributo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nombre: string) => atributosApi.crear(nombre),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_ATRIBUTOS }),
  });
}

export function useAgregarValorAtributo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idAtributo, valor }: { idAtributo: number; valor: string }) =>
      atributosApi.agregarValor(idAtributo, valor),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_ATRIBUTOS }),
  });
}
