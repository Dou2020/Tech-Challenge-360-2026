import { z } from 'zod';

/** DATETIME2 leído de SQL Server (mssql lo entrega como Date en UTC) → ISO 8601 UTC. */
export const aIso = (fecha: Date | string): string => new Date(fecha).toISOString();

export const aIsoOpcional = (fecha: Date | string | null): string | null =>
  fecha === null ? null : aIso(fecha);

/**
 * Desfase de Guatemala respecto de UTC. Es fijo: el país no aplica horario de verano desde 2006
 * (en SQL Server es 'Central America Standard Time', también sin horario de verano).
 */
const DESFASE_GUATEMALA = '-06:00';

const PATRON_SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const esquemaInstante = z.iso.datetime({ offset: true });
const esquemaSoloFecha = z.iso.date();

/**
 * Filtro de fecha de un listado (`desde`, `hasta`): un día `YYYY-MM-DD` o un instante ISO 8601
 * con zona (`2026-11-01T15:30:00Z`, `2026-11-01T09:30:00-06:00`). Un instante sin zona se
 * rechaza porque sería ambiguo. Vacío o ausente → sin filtro. Se conserva como texto: la
 * conversión a instantes UTC la hace `rangoFechas`.
 */
export const filtroFecha = z.preprocess(
  (valor) => (typeof valor === 'string' && valor.trim() === '' ? undefined : valor),
  z
    .string()
    .trim()
    .refine(
      (valor) =>
        esquemaSoloFecha.safeParse(valor).success || esquemaInstante.safeParse(valor).success,
      {
        message: 'Usa una fecha YYYY-MM-DD o un instante ISO 8601 con zona (2026-11-01T15:30:00Z).',
      },
    )
    .optional(),
);

export interface RangoFechas {
  desde: Date | null;
  hasta: Date | null;
}

/**
 * Convierte `desde` y `hasta` en instantes UTC, ambos inclusive.
 * Un día `YYYY-MM-DD` se toma como día de Guatemala, igual que los reportes: `desde` empieza a
 * las 00:00:00.000 de ese día y `hasta` cubre hasta las 23:59:59.999 (DATETIME2(3)), así
 * `desde=hasta=2026-11-01` trae todo el 1 de noviembre en hora local. Un instante se usa tal cual.
 */
export function rangoFechas(desde?: string, hasta?: string): RangoFechas {
  return {
    desde: desde === undefined ? null : inicioDe(desde),
    hasta: hasta === undefined ? null : finDe(hasta),
  };
}

function inicioDe(valor: string): Date {
  return PATRON_SOLO_FECHA.test(valor)
    ? new Date(`${valor}T00:00:00.000${DESFASE_GUATEMALA}`)
    : new Date(valor);
}

function finDe(valor: string): Date {
  return PATRON_SOLO_FECHA.test(valor)
    ? new Date(`${valor}T23:59:59.999${DESFASE_GUATEMALA}`)
    : new Date(valor);
}

/** Para el `refine` de los esquemas: false si `desde` es posterior a `hasta`. */
export function rangoValido(desde?: string, hasta?: string): boolean {
  const { desde: inicio, hasta: fin } = rangoFechas(desde, hasta);
  return inicio === null || fin === null || inicio.getTime() <= fin.getTime();
}
