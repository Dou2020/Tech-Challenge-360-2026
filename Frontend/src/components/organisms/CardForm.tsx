import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  etiquetasMarcaTarjeta,
  etiquetasTipoTarjeta,
  marcasTarjeta,
  tiposTarjeta,
} from '../../config/tarjetas';
import { ApiError } from '../../services/http';
import type { DatosTarjeta } from '../../types/tarjetas';
import { aplicarErroresApi } from '../../utils/formularios';
import { esquemaMarca, esquemaTipo, esquemaTitular, esquemaUltimos4 } from '../../utils/tarjetas';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';

const esquema = z.object({
  titular: esquemaTitular,
  ultimos4: esquemaUltimos4,
  tipo: esquemaTipo,
  marca: esquemaMarca,
  predeterminada: z.boolean(),
});
type Formulario = z.input<typeof esquema>;
const CAMPOS = Object.keys(esquema.shape) as (keyof Formulario)[];

interface Props {
  onGuardar: (datos: DatosTarjeta) => Promise<unknown>;
  onCancelar?: () => void;
}

/** Alta de una tarjeta sin comprar. Los errores de la API se muestran en su campo. */
export function CardForm({ onGuardar, onCancelar }: Props) {
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Formulario, unknown, z.output<typeof esquema>>({
    resolver: zodResolver(esquema),
    defaultValues: { titular: '', ultimos4: '', predeterminada: false },
  });

  const enviar = handleSubmit(async (valores) => {
    setErrorApi(null);
    try {
      await onGuardar(valores);
    } catch (error) {
      // 402 PAGO_RECHAZADO (0000) y 409 DUPLICADO no traen campo: van al mensaje general.
      if (!aplicarErroresApi(error, setError, CAMPOS)) {
        setErrorApi(error instanceof ApiError ? error.message : 'No se pudo guardar la tarjeta.');
      }
    }
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      {errorApi && <InlineAlert>{errorApi}</InlineAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Titular de la tarjeta"
          autoComplete="cc-name"
          error={errors.titular?.message}
          {...register('titular')}
        />
        <Input
          label="Últimos 4 dígitos de la tarjeta"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          error={errors.ultimos4?.message}
          {...register('ultimos4')}
        />
        <Select label="Tipo de tarjeta" error={errors.tipo?.message} {...register('tipo')}>
          <option value="">Elige el tipo</option>
          {tiposTarjeta.map((t) => (
            <option key={t} value={t}>
              {etiquetasTipoTarjeta[t]}
            </option>
          ))}
        </Select>
        <Select label="Marca" error={errors.marca?.message} {...register('marca')}>
          <option value="">Elige la marca</option>
          {marcasTarjeta.map((m) => (
            <option key={m} value={m}>
              {etiquetasMarcaTarjeta[m]}
            </option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm text-texto-suave">
        <input type="checkbox" {...register('predeterminada')} />
        Usar como tarjeta predeterminada
      </label>
      <p className="text-xs text-texto-tenue">
        Solo guardamos el titular, la marca, el tipo y los 4 últimos dígitos. Nunca el número
        completo ni el código de seguridad.
      </p>
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button variante="secondary" onClick={onCancelar} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
        <Button type="submit" cargando={isSubmitting}>
          Guardar tarjeta
        </Button>
      </div>
    </form>
  );
}
