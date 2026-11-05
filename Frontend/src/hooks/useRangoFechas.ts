import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { rangoPorDefecto } from '../utils/rangoFechas';

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rango `desde`/`hasta` de un reporte, guardado en la URL. Sin él, los últimos 30 días de Guatemala.
 * `valido` es false si falta un extremo o `desde` es posterior a `hasta` (la API respondería 400).
 */
export function useRangoFechas() {
  const [searchParams, setSearchParams] = useSearchParams();
  const porDefecto = useMemo(() => rangoPorDefecto(), []);
  const desdeUrl = searchParams.get('desde');
  const hastaUrl = searchParams.get('hasta');
  const desde = desdeUrl !== null && FORMATO_DIA.test(desdeUrl) ? desdeUrl : porDefecto.desde;
  const hasta = hastaUrl !== null && FORMATO_DIA.test(hastaUrl) ? hastaUrl : porDefecto.hasta;

  const setRango = useCallback(
    (cambios: { desde?: string; hasta?: string }) =>
      setSearchParams((previos) => {
        const siguientes = new URLSearchParams(previos);
        for (const [clave, valor] of Object.entries(cambios)) {
          if (valor) siguientes.set(clave, valor);
          else siguientes.delete(clave);
        }
        siguientes.delete('page');
        return siguientes;
      }),
    [setSearchParams],
  );

  const restablecer = useCallback(() => setRango({ desde: '', hasta: '' }), [setRango]);
  const valido = desde !== '' && hasta !== '' && desde <= hasta;
  const esPorDefecto = desdeUrl === null && hastaUrl === null;

  return { desde, hasta, valido, esPorDefecto, setRango, restablecer };
}
