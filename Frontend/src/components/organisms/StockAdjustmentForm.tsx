import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../services/http';
import type { Existencia } from '../../types/inventario';
import { aplicarErroresApi } from '../../utils/formularios';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';

const MAX_MOTIVO = 300;
const MAX_CANTIDAD = 1_000_000;

export type ClaseMovimiento = 'ENTRADA_COMPRA' | 'AJUSTE_ENTRADA' | 'AJUSTE_SALIDA';

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
    'idVariante' | 'sku' | 'producto' | 'existenciaFisica' | 'existenciaDisponible'
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
  const esAjuste = useWatch({ control, name: 'clase' }) !== 'ENTRADA_COMPRA';

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
        {variante.producto} · SKU {variante.sku} · física {variante.existenciaFisica}, disponible{' '}
        {variante.existenciaDisponible}
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
