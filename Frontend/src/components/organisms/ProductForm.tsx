import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '../../services/http';
import type {
  CategoriaGestion,
  DatosProducto,
  DatosProductoNuevo,
  ProductoGestion,
} from '../../types/gestion';
import {
  esquemaProducto,
  esquemaProductoNuevo,
  idsDeValores,
  MAX_DESCRIPCION_PRODUCTO,
  MAX_NOMBRE_PRODUCTO,
  varianteVacia,
  type FormularioProducto,
} from '../../utils/productoForm';
import { Button } from '../atoms/Button';
import { Field } from '../atoms/Field';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';
import { ariaCampo, claseControl } from '../../utils/campos';
import { VariantsEditor } from './VariantsEditor';

type Props = {
  categorias: CategoriaGestion[];
  onCancelar?: () => void;
} & (
  | {
      /** Crear: producto con sus variantes. */
      producto?: undefined;
      onGuardar: (datos: DatosProductoNuevo) => Promise<unknown>;
    }
  | {
      /** Editar: solo nombre, descripción y categoría (las variantes se gestionan aparte). */
      producto: ProductoGestion;
      onGuardar: (datos: DatosProducto) => Promise<unknown>;
    }
);

/** Campos del producto que pueden venir señalados en los `details` de la API. */
const CAMPOS_BASE = ['idCategoria', 'nombre', 'descripcion'] as const;

/**
 * Formulario de producto. Para crear incluye el editor de variantes; para editar, solo los datos
 * del producto. Los `details` del ApiError se muestran en su campo y un SKU repetido (409) en la variante.
 */
export function ProductForm(props: Props) {
  const { categorias, producto, onCancelar } = props;
  const editando = producto !== undefined;
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormularioProducto>({
    resolver: zodResolver(editando ? esquemaProducto : esquemaProductoNuevo),
    defaultValues: {
      idCategoria: producto ? String(producto.idCategoria) : '',
      nombre: producto?.nombre ?? '',
      descripcion: producto?.descripcion ?? '',
      variantes: editando ? [] : [varianteVacia()],
    },
  });

  async function enviar(valores: FormularioProducto) {
    setErrorEnvio(null);
    const base = {
      idCategoria: Number(valores.idCategoria),
      nombre: valores.nombre,
      ...(valores.descripcion ? { descripcion: valores.descripcion } : {}),
    };
    try {
      if (props.producto) {
        await props.onGuardar(base);
      } else {
        await props.onGuardar({
          ...base,
          variantes: valores.variantes.map((v) => ({
            sku: v.sku,
            precio: v.precio,
            existenciaInicial: v.existenciaInicial === '' ? 0 : Number(v.existenciaInicial),
            valores: idsDeValores(v.valores),
          })),
        });
      }
    } catch (error) {
      if (!(error instanceof ApiError)) return setErrorEnvio('No se pudo guardar el producto.');
      let aplicado = false;
      for (const { field, message } of error.details) {
        const base = CAMPOS_BASE.find((c) => c === field);
        const variante = /^variantes\.(\d+)\.(sku|precio|existenciaInicial)$/.exec(field);
        if (base) {
          setError(base, { type: 'server', message });
          aplicado = true;
        } else if (variante) {
          setError(
            `variantes.${Number(variante[1])}.${variante[2] as 'sku' | 'precio' | 'existenciaInicial'}`,
            { type: 'server', message },
          );
          aplicado = true;
        }
      }
      if (!aplicado) {
        setErrorEnvio(
          error.code === 'DUPLICADO'
            ? 'Un SKU ya existe en otro producto. Usa un SKU distinto.'
            : error.code === 'NO_ENCONTRADO'
              ? 'La categoría elegida ya no existe.'
              : error.message,
        );
      }
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(enviar)(e)} noValidate className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Nombre"
          maxLength={MAX_NOMBRE_PRODUCTO}
          error={errors.nombre?.message}
          {...register('nombre')}
        />
        <Select label="Categoría" error={errors.idCategoria?.message} {...register('idCategoria')}>
          <option value="">Elige una categoría</option>
          {categorias.map((c) => (
            <option key={c.idCategoria} value={c.idCategoria}>
              {c.nombre}
              {c.activo ? '' : ' (inactiva)'}
            </option>
          ))}
        </Select>
      </div>
      <Field
        id="producto-descripcion"
        label="Descripción (opcional)"
        error={errors.descripcion?.message}
      >
        <textarea
          id="producto-descripcion"
          rows={3}
          maxLength={MAX_DESCRIPCION_PRODUCTO}
          {...ariaCampo('producto-descripcion', errors.descripcion?.message)}
          className={claseControl(Boolean(errors.descripcion))}
          {...register('descripcion')}
        />
      </Field>

      {!editando && <VariantsEditor control={control} register={register} errors={errors} />}

      {errorEnvio && <InlineAlert>{errorEnvio}</InlineAlert>}
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button variante="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" cargando={isSubmitting}>
          {editando ? 'Guardar cambios' : 'Crear producto'}
        </Button>
      </div>
    </form>
  );
}
