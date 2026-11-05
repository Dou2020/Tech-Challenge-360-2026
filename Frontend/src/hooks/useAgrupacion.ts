import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import type { Agrupacion } from '../types/reportes';

export const AGRUPACIONES: { valor: Agrupacion; etiqueta: string }[] = [
  { valor: 'dia', etiqueta: 'Por día' },
  { valor: 'semana', etiqueta: 'Por semana' },
  { valor: 'mes', etiqueta: 'Por mes' },
];

/** Agrupación de la serie de ventas (día, semana o mes), guardada en la URL; `dia` es el valor por defecto. */
export function useAgrupacion() {
  const [searchParams, setSearchParams] = useSearchParams();
  const enUrl = searchParams.get('agrupacion');
  const agrupacion: Agrupacion = enUrl === 'semana' || enUrl === 'mes' ? enUrl : 'dia';

  const setAgrupacion = useCallback(
    (valor: string) =>
      setSearchParams((previos) => {
        const siguientes = new URLSearchParams(previos);
        if (valor === 'dia') siguientes.delete('agrupacion');
        else siguientes.set('agrupacion', valor);
        return siguientes;
      }),
    [setSearchParams],
  );

  return { agrupacion, setAgrupacion };
}
