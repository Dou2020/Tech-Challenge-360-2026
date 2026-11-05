import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '../../services/http';
import type { Cupon, DatosCupon } from '../../types/administracion';
import type { CategoriaGestion } from '../../types/gestion';
import {
  CAMPOS_CUPON,
  cuponVacio,
  datosDeFormulario,
  esquemaCupon,
  formularioDeCupon,
  type FormularioCupon,
} from '../../utils/cuponForm';
import { aplicarErroresApi } from '../../utils/formularios';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';

interface Props {
  /** Cupón a editar; sin él crea uno nuevo. */
  cupon?: Cupon;
  categorias: CategoriaGestion[];
  /** Guarda; debe rechazar con el ApiError si falla. */
  onGuardar: (datos: DatosCupon) => Promise<unknown>;
  onCancelar?: () => void;
}

/**
 * Alta y edición de cupones. Las fechas se capturan en hora de Guatemala y se envían como instante UTC.
 * Un código repetido (409) y un límite por debajo de los usos (400) se muestran en su campo.
 */
export function CouponForm({ cupon, categorias, onGuardar, onCancelar }: Props) {
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormularioCupon>({
    resolver: zodResolver(esquemaCupon),
    defaultValues: cupon ? formularioDeCupon(cupon) : cuponVacio(),
  });

  async function enviar(valores: FormularioCupon) {
    setErrorEnvio(null);
    if (cupon && Number(valores.limiteUsosTotal) < cupon.usosActuales) {
      return setError('limiteUsosTotal', {
        type: 'validate',
        message: `No puede ser menor que los usos actuales (${cupon.usosActuales}).`,
      });
    }
    try {
      await onGuardar(datosDeFormulario(valores));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DUPLICADO') {
        setError('codigo', { type: 'server', message: 'Ya existe un cupón con ese código.' });
      } else if (!aplicarErroresApi(error, setError, CAMPOS_CUPON)) {
        setErrorEnvio(error instanceof ApiError ? error.message : 'No se pudo guardar el cupón.');
      }
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(enviar)(e)} noValidate className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          label="Código"
          maxLength={30}
          autoCapitalize="characters"
          ayuda="Letras, números, guion y guion bajo. Se guarda en mayúsculas."
          error={errors.codigo?.message}
          {...register('codigo')}
        />
        <Select
          label="Tipo de descuento"
          error={errors.tipoDescuento?.message}
          {...register('tipoDescuento')}
        >
          <option value="PORCENTAJE">Porcentaje</option>
          <option value="MONTO_FIJO">Monto fijo (Q)</option>
        </Select>
        <Input
          label="Valor"
          inputMode="decimal"
          error={errors.valor?.message}
          {...register('valor')}
        />
        <Select
          label="Categoría (opcional)"
          ayuda="Sin categoría aplica a todo el carrito."
          error={errors.idCategoria?.message}
          {...register('idCategoria')}
        >
          <option value="">Todo el carrito</option>
          {categorias.map((c) => (
            <option key={c.idCategoria} value={c.idCategoria}>
              {c.nombre}
              {c.activo ? '' : ' (inactiva)'}
            </option>
          ))}
        </Select>
        <Input
          label="Monto mínimo (Q)"
          inputMode="decimal"
          error={errors.montoMinimo?.message}
          {...register('montoMinimo')}
        />
        <Input
          label="Descripción (opcional)"
          maxLength={300}
          error={errors.descripcion?.message}
          {...register('descripcion')}
        />
        <Input
          label="Inicio (hora de Guatemala)"
          type="datetime-local"
          error={errors.fechaInicio?.message}
          {...register('fechaInicio')}
        />
        <Input
          label="Fin (hora de Guatemala)"
          type="datetime-local"
          error={errors.fechaFin?.message}
          {...register('fechaFin')}
        />
        <span aria-hidden className="hidden lg:block" />
        <Input
          label="Límite total de usos"
          inputMode="numeric"
          error={errors.limiteUsosTotal?.message}
          {...register('limiteUsosTotal')}
        />
        <Input
          label="Límite de usos por cliente"
          inputMode="numeric"
          error={errors.limiteUsosPorCliente?.message}
          {...register('limiteUsosPorCliente')}
        />
      </div>
      {errorEnvio && <InlineAlert>{errorEnvio}</InlineAlert>}
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button variante="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" cargando={isSubmitting}>
          {cupon ? 'Guardar cambios' : 'Crear cupón'}
        </Button>
      </div>
    </form>
  );
}
