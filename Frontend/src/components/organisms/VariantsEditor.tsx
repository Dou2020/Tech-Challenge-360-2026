import { useState } from 'react';
import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { useAtributos } from '../../hooks/queries';
import { MAX_VARIANTES, varianteVacia, type FormularioProducto } from '../../utils/productoForm';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Skeleton } from '../atoms/Skeleton';
import { ErrorState } from '../molecules/ErrorState';
import { AttributesPanel } from './AttributesPanel';
import { AttributeValueFields } from './AttributeValueFields';

interface Props {
  control: Control<FormularioProducto>;
  register: UseFormRegister<FormularioProducto>;
  errors: FieldErrors<FormularioProducto>;
}

/** Variantes de un producto nuevo (1 a 50): SKU, precio, existencia inicial y un valor por atributo. */
export function VariantsEditor({ control, register, errors }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: 'variantes' });
  const atributos = useAtributos();
  const [gestionando, setGestionando] = useState(false);
  const errorLista = errors.variantes?.root?.message ?? errors.variantes?.message;

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-texto">Variantes</legend>

      {atributos.isPending && <Skeleton className="h-10 w-full" />}
      {atributos.isError && (
        <ErrorState error={atributos.error} onReintentar={() => void atributos.refetch()} />
      )}

      {fields.map((campo, i) => {
        const e = errors.variantes?.[i];
        const errorValores = (e?.valores as { message?: string } | undefined)?.message;
        return (
          <div key={campo.id} className="space-y-3 rounded-lg border border-borde p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-texto">Variante {i + 1}</h3>
              {fields.length > 1 && (
                <Button
                  variante="ghost"
                  aria-label={`Quitar variante ${i + 1}`}
                  onClick={() => remove(i)}
                >
                  Quitar
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label={`SKU de la variante ${i + 1}`}
                maxLength={50}
                error={e?.sku?.message}
                {...register(`variantes.${i}.sku`)}
              />
              <Input
                label={`Precio de la variante ${i + 1}`}
                inputMode="decimal"
                placeholder="149.00"
                ayuda="En quetzales, IVA incluido."
                error={e?.precio?.message}
                {...register(`variantes.${i}.precio`)}
              />
              <Input
                label={`Existencia inicial de la variante ${i + 1}`}
                inputMode="numeric"
                placeholder="0"
                error={e?.existenciaInicial?.message}
                {...register(`variantes.${i}.existenciaInicial`)}
              />
            </div>
            {atributos.data && (
              <AttributeValueFields
                atributos={atributos.data}
                prefijo={`variante-${i}`}
                error={errorValores}
                registrar={(clave) => register(`variantes.${i}.valores.${clave}`)}
              />
            )}
          </div>
        );
      })}

      {errorLista && (
        <p role="alert" className="text-xs text-peligro-texto">
          {errorLista}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variante="secondary"
          disabled={fields.length >= MAX_VARIANTES}
          onClick={() => append(varianteVacia())}
        >
          Agregar variante
        </Button>
        <Button variante="ghost" onClick={() => setGestionando((a) => !a)}>
          {gestionando ? 'Ocultar atributos' : 'Gestionar atributos'}
        </Button>
      </div>
      {gestionando && <AttributesPanel />}
    </fieldset>
  );
}
