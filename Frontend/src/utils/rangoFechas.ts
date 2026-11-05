const ZONA_HORARIA = 'America/Guatemala';

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día de Guatemala (YYYY-MM-DD) de un instante. */
export function diaDeGuatemala(fecha: Date = new Date()): string {
  return formatoDia.format(fecha);
}

/** Resta días a un YYYY-MM-DD sin depender de la zona del navegador. */
export function restarDias(dia: string, dias: number): string {
  const [anio, mes, d] = dia.split('-').map(Number) as [number, number, number];
  const fecha = new Date(Date.UTC(anio, mes - 1, d - dias));
  return fecha.toISOString().slice(0, 10);
}

/** Últimos 30 días (hoy incluido) en hora de Guatemala: es el rango por defecto de los reportes. */
export function rangoPorDefecto(ahora: Date = new Date()): { desde: string; hasta: string } {
  const hasta = diaDeGuatemala(ahora);
  return { desde: restarDias(hasta, 29), hasta };
}

/** "2026-11-03" → "03/11/2026" sin pasar por Date (no hay corrimiento de zona). */
export function formatearDia(dia: string): string {
  const [anio, mes, d] = dia.split('-');
  return `${d}/${mes}/${anio}`;
}

/** Guatemala está en UTC-6 todo el año (sin horario de verano). */
const DESFASE_GUATEMALA_MS = 6 * 60 * 60 * 1000;

/** Valor de un `datetime-local` ("2026-11-01T00:00", hora de Guatemala) → instante ISO UTC. */
export function guatemalaAIso(local: string): string {
  return new Date(`${local}:00-06:00`).toISOString();
}

/** Instante ISO → valor de `datetime-local` en hora de Guatemala ("2026-11-01T00:00"). */
export function isoAGuatemala(iso: string): string {
  return new Date(Date.parse(iso) - DESFASE_GUATEMALA_MS).toISOString().slice(0, 16);
}
