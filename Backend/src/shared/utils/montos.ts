import { z } from 'zod';

/**
 * Convierte un DECIMAL(12,2) leído de SQL Server (mssql lo entrega como number)
 * al formato de la API: string con 2 decimales ("125.50").
 */
export function aMonto(valor: number | string): string {
  return Number(valor).toFixed(2);
}

/** Igual que aMonto, pero conserva null (descuento o cupón ausente). */
export function aMontoOpcional(valor: number | string | null | undefined): string | null {
  return valor === null || valor === undefined ? null : aMonto(valor);
}

/**
 * Monto de entrada: string decimal no negativo con hasta 2 decimales y que quepa en
 * DECIMAL(12,2) ("149", "149.5", "149.00"). Se entrega como number para sql.Decimal(12, 2).
 */
export const esquemaMonto = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Debe ser un monto con hasta 2 decimales, por ejemplo "149.00".')
  .transform(Number);
