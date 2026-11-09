import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../services/http';
import type { Existencia } from '../../types/inventario';
import { aplicarErroresApi } from '../../utils/formularios';
import { proyectarExistencia, type ClaseMovimiento } from '../../utils/inventario';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';

const MAX_MOTIVO = 300;
const MAX_CANTIDAD = 1_000_000;

export type { ClaseMovimiento };

const esquema = z
  .object({
    clase: z.enum(['ENTRADA_COMPRA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA']),
    cantidad: z
      .string()
      .trim()
      .refine((v) => /^\d+$/.test(v) && Number(v) >= 1, 'Debe ser un entero mayor que 0.')
      .refine((v) => Number(v) <= MAX_CANTIDAD, `Máximo ${MAX_CANTIDAD} unidades por movimiento.`),
    motivo: z.string().trim().max(MAX_MOTIVO, 'Máximo 300 caracteres.'),
  })
  .refine((v) => v.clase === 'ENTRADA_COMPRA' || v.motivo !== '', {
    path: ['motivo'],
    message: 'El motivo es obligatorio en un ajuste.',
  });

type Formulario = z.infer<typeof esquema>;

export interface DatosMovimiento {
  clase: ClaseMovimiento;
  cantidad: number;
  motivo: string;
}

interface Props {
  variante: Pick<
    Existencia,
    'idVariante' | 'sku' | 'producto' | 'descripcion' | 'existenciaFisica' | 'existenciaDisponible'
  >;
  /** Registra el movimiento; debe rechazar con el error de la API si falla. */
  onEnviar: (datos: DatosMovimiento) => Promise<unknown>;
  onCancelar?: () => void;
}

/** Entrada por compra (motivo opcional) o ajuste de entrada o salida (motivo obligatorio). */
export function StockAdjustmentForm({ variante, onEnviar, onCancelar }: Props) {
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    resolver: zodResolver(esquema),
    defaultValues: { clase: 'ENTRADA_COMPRA', cantidad: '', motivo: '' },
  });
  const clase = useWatch({ control, name: 'clase' });
  const cantidadTexto = useWatch({ control, name: 'cantidad' }).trim();
  const esAjuste = clase !== 'ENTRADA_COMPRA';
  const cantidad =
    /^\d+$/.test(cantidadTexto) &&
    Number(cantidadTexto) >= 1 &&
    Number(cantidadTexto) <= MAX_CANTIDAD
      ? Number(cantidadTexto)
      : null;
  const proyeccion = cantidad === null ? null : proyectarExistencia(variante, clase, cantidad);

  async function enviar(valores: Formulario) {
    setErrorEnvio(null);
    try {
      await onEnviar({
        clase: valores.clase,
        cantidad: Number(valores.cantidad),
        motivo: valores.motivo,
      });
      reset();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EXISTENCIA_NEGATIVA') {
        setError('cantidad', {
          type: 'server',
          message: 'La salida dejaría la existencia en negativo o por debajo de lo reservado.',
        });
      } else if (!aplicarErroresApi(error, setError, ['cantidad', 'motivo'])) {
        setErrorEnvio(
          error instanceof ApiError ? error.message : 'No se pudo registrar el movimiento.',
        );
      }
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(enviar)(e)} noValidate className="space-y-4">
      <p className="text-sm text-texto-suave">
        {variante.producto}
        {variante.descripcion ? ` · ${variante.descripcion}` : ''} · SKU {variante.sku} · física{' '}
        {variante.existenciaFisica}, disponible {variante.existenciaDisponible}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Tipo de movimiento" {...register('clase')}>
          <option value="ENTRADA_COMPRA">Entrada por compra</option>
          <option value="AJUSTE_ENTRADA">Ajuste de entrada</option>
          <option value="AJUSTE_SALIDA">Ajuste de salida</option>
        </Select>
        <Input
          label="Cantidad"
          type="number"
          inputMode="numeric"
          min={1}
          error={errors.cantidad?.message}
          {...register('cantidad')}
        />
        <Input
          label={esAjuste ? 'Motivo' : 'Motivo (opcional)'}
          maxLength={MAX_MOTIVO}
          error={errors.motivo?.message}
          {...register('motivo')}
        />
      </div>
      {proyeccion && (
        <div aria-live="polite" className="space-y-2 text-sm">
          <p className="text-texto-suave">
            Quedaría: física {variante.existenciaFisica} → {proyeccion.fisica}, disponible{' '}
            {variante.existenciaDisponible} → {proyeccion.disponible}.
          </p>
          {proyeccion.disponible < 0 && (
            <p className="rounded-lg border border-aviso-borde bg-aviso-suave px-3 py-2 text-aviso-texto">
              La salida supera lo disponible ({variante.existenciaDisponible}): con la existencia
              actual, el sistema la rechazará.
            </p>
          )}
        </div>
      )}
      {errorEnvio && <InlineAlert>{errorEnvio}</InlineAlert>}
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button variante="secondary" onClick={onCancelar}>
            Cerrar
          </Button>
        )}
        <Button type="submit" cargando={isSubmitting}>
          Registrar movimiento
        </Button>
      </div>
    </form>
  );
}
