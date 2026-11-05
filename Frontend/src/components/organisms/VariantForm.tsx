import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '../../services/http';
import type { Atributo, VarianteGestion } from '../../types/gestion';
import { esquemaVariante, idsDeValores, valoresDeVariante } from '../../utils/productoForm';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { AttributeValueFields } from './AttributeValueFields';

type Formulario = {
  sku: string;
  precio: string;
  existenciaInicial: string;
  valores: Record<string, string>;
};

export interface DatosVarianteForm {
  sku: string;
  precio: string;
  existenciaInicial: number;
  valores: number[];
}

interface Props {
  atributos: Atributo[];
  /** Variante a editar (sku y valores); sin ella crea una con precio y existencia inicial. */
  variante?: VarianteGestion;
  /** Guarda; debe rechazar con el ApiError si falla. */
  onGuardar: (datos: DatosVarianteForm) => Promise<unknown>;
  onCancelar: () => void;
}

/** Agregar una variante a un producto o editar su SKU y sus valores de atributo. */
export function VariantForm({ atributos, variante, onGuardar, onCancelar }: Props) {
  const editando = variante !== undefined;
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    resolver: zodResolver(esquemaVariante),
    defaultValues: {
      sku: variante?.sku ?? '',
      // En edición el precio no se muestra (se cambia aparte); el valor solo satisface el esquema.
      precio: variante?.precio ?? '',
      existenciaInicial: '',
      valores: variante ? valoresDeVariante(variante) : {},
    },
  });

  async function enviar(v: Formulario) {
    setErrorEnvio(null);
    try {
      await onGuardar({
        sku: v.sku,
        precio: v.precio,
        existenciaInicial: v.existenciaInicial === '' ? 0 : Number(v.existenciaInicial),
        valores: idsDeValores(v.valores),
      });
    } catch (error) {
      if (!(error instanceof ApiError)) return setErrorEnvio('No se pudo guardar la variante.');
      let aplicado = false;
      for (const { field, message } of error.details) {
        if (field === 'sku' || field === 'precio' || field === 'existenciaInicial') {
          setError(field, { type: 'server', message });
          aplicado = true;
        }
      }
      if (error.code === 'DUPLICADO') {
        setError('sku', { type: 'server', message: 'Ya existe una variante con ese SKU.' });
      } else if (!aplicado) {
        setErrorEnvio(error.message);
      }
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(enviar)(e)} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="SKU" maxLength={50} error={errors.sku?.message} {...register('sku')} />
        {!editando && (
          <>
            <Input
              label="Precio"
              inputMode="decimal"
              placeholder="149.00"
              error={errors.precio?.message}
              {...register('precio')}
            />
            <Input
              label="Existencia inicial"
              inputMode="numeric"
              placeholder="0"
              error={errors.existenciaInicial?.message}
              {...register('existenciaInicial')}
            />
          </>
        )}
      </div>
      <AttributeValueFields
        atributos={atributos}
        prefijo={`variante-form-${variante?.idVariante ?? 'nueva'}`}
        registrar={(clave) => register(`valores.${clave}`)}
      />
      {errorEnvio && <InlineAlert>{errorEnvio}</InlineAlert>}
      <div className="flex justify-end gap-2">
        <Button variante="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" cargando={isSubmitting}>
          {editando ? 'Guardar variante' : 'Agregar variante'}
        </Button>
      </div>
    </form>
  );
}
