import { z } from 'zod';
import { marcasTarjeta, tiposTarjeta } from '../config/tarjetas';
import type { DatosPago } from '../types/checkout';
import type { MarcaTarjeta, Tarjeta, TipoTarjeta } from '../types/tarjetas';

// Mismas reglas que Backend/API.md, "Tarjetas guardadas".
export const esquemaTitular = z
  .string()
  .trim()
  .min(1, 'Ingresa el nombre del titular.')
  .max(150, 'Máximo 150 caracteres.');
export const esquemaUltimos4 = z.string().regex(/^\d{4}$/, 'Ingresa exactamente 4 dígitos.');
export const esquemaTipo = z.enum(tiposTarjeta, { error: 'Elige crédito o débito.' });
export const esquemaMarca = z.enum(marcasTarjeta, { error: 'Elige la marca de la tarjeta.' });

/** Valor del radio "Usar otra tarjeta". */
export const OTRA_TARJETA = 'otra';

/** Tarjeta que debe quedar elegida al abrir el pago: la predeterminada, o la primera. */
export function seleccionInicial(tarjetas: Tarjeta[]): string {
  const elegida = tarjetas.find((t) => t.predeterminada) ?? tarjetas[0];
  return elegida ? String(elegida.idTarjeta) : OTRA_TARJETA;
}

export interface ValoresPago {
  seleccion: string;
  titular: string;
  ultimos4: string;
  /** Vacío mientras no se elija; el esquema del formulario lo exige solo al guardar. */
  tipo: string;
  marca: string;
  guardar: boolean;
}

/** Traduce el formulario al `datosPago` del backend: tarjeta guardada o nueva. */
export function construirDatosPago(v: ValoresPago): DatosPago {
  if (v.seleccion !== OTRA_TARJETA) return { idTarjeta: Number(v.seleccion) };
  return {
    titular: v.titular,
    ultimos4: v.ultimos4,
    ...(v.tipo ? { tipo: v.tipo as TipoTarjeta } : {}),
    ...(v.marca ? { marca: v.marca as MarcaTarjeta } : {}),
    ...(v.guardar ? { guardar: true } : {}),
  };
}
