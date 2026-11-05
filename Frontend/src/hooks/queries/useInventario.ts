import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventarioApi } from '../../services/api/inventario';
import type { DatosAjuste, DatosEntrada } from '../../types/inventario';

/** Existencias, kardex y tipos cuelgan de ['inventario'] para invalidarlos juntos. */
export const CLAVE_INVENTARIO = ['inventario'] as const;

/** Entrada por compra o ajuste manual; `clase` decide el endpoint. */
export type MovimientoNuevo =
  ({ clase: 'ENTRADA_COMPRA' } & DatosEntrada) | ({ clase: 'AJUSTE' } & DatosAjuste);

type Params = Record<string, string | number | undefined>;

export function useExistencias(params: Params) {
  return useQuery({
    queryKey: [...CLAVE_INVENTARIO, 'existencias', params],
    queryFn: () => inventarioApi.existencias(params),
    placeholderData: keepPreviousData,
  });
}

export function useKardex(idVariante: number, params: Params) {
  return useQuery({
    queryKey: [...CLAVE_INVENTARIO, 'kardex', idVariante, params],
    queryFn: () => inventarioApi.kardex(idVariante, params),
    enabled: Number.isInteger(idVariante) && idVariante > 0,
    placeholderData: keepPreviousData,
  });
}

export function useTiposMovimiento() {
  return useQuery({
    queryKey: [...CLAVE_INVENTARIO, 'tipos'],
    queryFn: inventarioApi.tiposMovimiento,
    staleTime: 10 * 60_000,
  });
}

/** Registra una entrada por compra o un ajuste y refresca existencias y kardex. */
export function useRegistrarMovimiento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: MovimientoNuevo) =>
      datos.clase === 'ENTRADA_COMPRA'
        ? inventarioApi.registrarEntrada({
            idVariante: datos.idVariante,
            cantidad: datos.cantidad,
            ...(datos.motivo ? { motivo: datos.motivo } : {}),
          })
        : inventarioApi.registrarAjuste({
            idVariante: datos.idVariante,
            tipo: datos.tipo,
            cantidad: datos.cantidad,
            motivo: datos.motivo,
          }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAVE_INVENTARIO }),
  });
}
