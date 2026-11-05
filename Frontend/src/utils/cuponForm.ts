import { z } from 'zod';
import type { Cupon, DatosCupon } from '../types/administracion';
import { guatemalaAIso, isoAGuatemala } from './rangoFechas';

/** Mismas reglas que Backend/API.md, "Cupones". */
const MAX_LIMITE = 1_000_000;
const MONTO = /^\d{1,10}(\.\d{1,2})?$/;
const MENSAJE_MONTO = 'Debe ser un monto con hasta 2 decimales, por ejemplo 10.50.';

const entero = (minimo: number) =>
  z
    .string()
    .trim()
    .refine(
      (v) => /^\d+$/.test(v) && Number(v) >= minimo && Number(v) <= MAX_LIMITE,
      `Debe ser un entero entre ${minimo} y ${MAX_LIMITE}.`,
    );

export const esquemaCupon = z
  .object({
    codigo: z
      .string()
      .trim()
      .min(1, 'Ingresa el código.')
      .max(30, 'Máximo 30 caracteres.')
      .regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, guion y guion bajo.'),
    descripcion: z.string().trim().max(300, 'Máximo 300 caracteres.'),
    tipoDescuento: z.enum(['PORCENTAJE', 'MONTO_FIJO']),
    valor: z
      .string()
      .trim()
      .refine((v) => MONTO.test(v), MENSAJE_MONTO)
      .refine((v) => Number(v) > 0, 'Debe ser mayor que 0.'),
    idCategoria: z.string(),
    montoMinimo: z
      .string()
      .trim()
      .refine((v) => v === '' || MONTO.test(v), MENSAJE_MONTO),
    fechaInicio: z.string().min(1, 'Indica la fecha de inicio.'),
    fechaFin: z.string().min(1, 'Indica la fecha de fin.'),
    limiteUsosTotal: entero(1),
    limiteUsosPorCliente: entero(1),
  })
  .superRefine((c, ctx) => {
    if (c.tipoDescuento === 'PORCENTAJE' && Number(c.valor) > 100)
      ctx.addIssue({ code: 'custom', path: ['valor'], message: 'Un porcentaje no pasa de 100.' });
    if (c.fechaInicio && c.fechaFin && c.fechaFin <= c.fechaInicio)
      ctx.addIssue({
        code: 'custom',
        path: ['fechaFin'],
        message: 'Debe ser posterior a la fecha de inicio.',
      });
    if (Number(c.limiteUsosPorCliente) > Number(c.limiteUsosTotal))
      ctx.addIssue({
        code: 'custom',
        path: ['limiteUsosPorCliente'],
        message: 'No puede superar el límite total de usos.',
      });
  });

export type FormularioCupon = z.infer<typeof esquemaCupon>;

export const CAMPOS_CUPON = [
  'codigo',
  'descripcion',
  'tipoDescuento',
  'valor',
  'idCategoria',
  'montoMinimo',
  'fechaInicio',
  'fechaFin',
  'limiteUsosTotal',
  'limiteUsosPorCliente',
] as const;

export function cuponVacio(): FormularioCupon {
  return {
    codigo: '',
    descripcion: '',
    tipoDescuento: 'PORCENTAJE',
    valor: '',
    idCategoria: '',
    montoMinimo: '0',
    fechaInicio: '',
    fechaFin: '',
    limiteUsosTotal: '',
    limiteUsosPorCliente: '1',
  };
}

export function formularioDeCupon(c: Cupon): FormularioCupon {
  return {
    codigo: c.codigo,
    descripcion: c.descripcion ?? '',
    tipoDescuento: c.tipoDescuento,
    valor: c.valor,
    idCategoria: c.idCategoria === null ? '' : String(c.idCategoria),
    montoMinimo: c.montoMinimo,
    fechaInicio: isoAGuatemala(c.fechaInicio),
    fechaFin: isoAGuatemala(c.fechaFin),
    limiteUsosTotal: String(c.limiteUsosTotal),
    limiteUsosPorCliente: String(c.limiteUsosPorCliente),
  };
}

/** Formulario → body de la API: código en mayúsculas y fechas de Guatemala como instante UTC. */
export function datosDeFormulario(f: FormularioCupon): DatosCupon {
  return {
    codigo: f.codigo.toUpperCase(),
    ...(f.descripcion ? { descripcion: f.descripcion } : {}),
    tipoDescuento: f.tipoDescuento,
    valor: f.valor,
    ...(f.idCategoria ? { idCategoria: Number(f.idCategoria) } : {}),
    montoMinimo: f.montoMinimo === '' ? '0' : f.montoMinimo,
    fechaInicio: guatemalaAIso(f.fechaInicio),
    fechaFin: guatemalaAIso(f.fechaFin),
    limiteUsosTotal: Number(f.limiteUsosTotal),
    limiteUsosPorCliente: Number(f.limiteUsosPorCliente),
  };
}

export type EstadoCupon = 'Inactivo' | 'Agotado' | 'Vigente' | 'Vencido' | 'Próximo';

/** Etiqueta de estado para la lista; `vigente` y `agotado` los calcula la API, aquí solo se distingue vencido de próximo. */
export function estadoDeCupon(c: Cupon, ahora: number = Date.now()): EstadoCupon {
  if (!c.activo) return 'Inactivo';
  if (c.agotado) return 'Agotado';
  if (c.vigente) return 'Vigente';
  return Date.parse(c.fechaFin) < ahora ? 'Vencido' : 'Próximo';
}
