const ZONA_HORARIA = 'America/Guatemala';

const formatoMoneda = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });

const formatoFecha = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: ZONA_HORARIA,
});

/** Montos en quetzales. La API los envía como string decimal ("125.50"). */
export function formatearMonto(monto: string | number): string {
  return formatoMoneda.format(Number(monto));
}

/** Fecha y hora en la zona de Guatemala. La API envía ISO 8601 en UTC. */
export function formatearFecha(fecha: string | Date): string {
  return formatoFecha.format(typeof fecha === 'string' ? new Date(fecha) : fecha);
}
