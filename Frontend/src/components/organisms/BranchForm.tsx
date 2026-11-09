import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../services/http';
import type { DatosSucursal, SucursalGestion } from '../../types/sucursales';
import { aplicarErroresApi } from '../../utils/formularios';
import { municipiosDe, nombresDepartamentos } from '../../utils/ubicaciones';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';

// Mismas reglas que Backend/API.md, "Sucursales".
const esquema = z.object({
  nombre: z.string().trim().min(1, 'Ingresa el nombre.').max(100, 'Máximo 100 caracteres.'),
  telefono: z
    .string()
    .trim()
    .regex(/^\d{8,20}$/, 'Teléfono inválido: de 8 a 20 dígitos.'),
  linea1: z.string().trim().min(1, 'Ingresa la dirección.').max(200, 'Máximo 200 caracteres.'),
  linea2: z.string().trim().max(200, 'Máximo 200 caracteres.'),
  departamento: z.string().min(1, 'Elige un departamento.'),
  municipio: z.string().min(1, 'Elige un municipio.'),
  codigoPostal: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{5}$/.test(v), 'Debe tener 5 dígitos.'),
  horario: z.string().trim().max(200, 'Máximo 200 caracteres.'),
});
type Formulario = z.infer<typeof esquema>;
const CAMPOS = Object.keys(esquema.shape) as (keyof Formulario)[];

interface Props {
  /** Sucursal a editar; sin ella crea una nueva. */
  sucursal?: SucursalGestion;
  /** Guarda; debe rechazar con el ApiError si falla. */
  onGuardar: (datos: DatosSucursal) => Promise<unknown>;
  onCancelar: () => void;
}

/** Crear o editar una sucursal de retiro. Un nombre repetido (409 DUPLICADO) se marca en el campo. */
export function BranchForm({ sucursal, onGuardar, onCancelar }: Props) {
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nombre: sucursal?.nombre ?? '',
      telefono: sucursal?.telefono ?? '',
      linea1: sucursal?.linea1 ?? '',
      linea2: sucursal?.linea2 ?? '',
      departamento: sucursal?.departamento ?? '',
      municipio: sucursal?.municipio ?? '',
      codigoPostal: sucursal?.codigoPostal ?? '',
      horario: sucursal?.horario ?? '',
    },
  });

  const departamento = useWatch({ control, name: 'departamento' });
  const municipios = municipiosDe(departamento);
  // Un valor guardado fuera de la lista no se pierde al editar.
  const departamentos =
    sucursal && !nombresDepartamentos.includes(sucursal.departamento)
      ? [sucursal.departamento, ...nombresDepartamentos]
      : nombresDepartamentos;
  const opcionesMunicipio =
    sucursal && departamento === sucursal.departamento && !municipios.includes(sucursal.municipio)
      ? [sucursal.municipio, ...municipios]
      : municipios;

  const enviar = handleSubmit(async (valores) => {
    setErrorEnvio(null);
    const { linea2, codigoPostal, horario, ...obligatorios } = valores;
    const datos: DatosSucursal = {
      ...obligatorios,
      ...(linea2 ? { linea2 } : {}),
      ...(codigoPostal ? { codigoPostal } : {}),
      ...(horario ? { horario } : {}),
    };
    try {
      await onGuardar(datos);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DUPLICADO') {
        setError('nombre', { type: 'server', message: 'Ya existe una sucursal con ese nombre.' });
      } else if (!aplicarErroresApi(error, setError, CAMPOS)) {
        setErrorEnvio(
          error instanceof ApiError ? error.message : 'No se pudo guardar la sucursal.',
        );
      }
    }
  });

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-4">
      {errorEnvio && <InlineAlert>{errorEnvio}</InlineAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre"
          maxLength={100}
          error={errors.nombre?.message}
          {...register('nombre')}
        />
        <Input
          label="Teléfono"
          type="tel"
          autoComplete="off"
          error={errors.telefono?.message}
          {...register('telefono')}
        />
      </div>
      <Input
        label="Dirección"
        maxLength={200}
        error={errors.linea1?.message}
        {...register('linea1')}
      />
      <Input
        label="Complemento (opcional)"
        maxLength={200}
        error={errors.linea2?.message}
        {...register('linea2')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Departamento"
          error={errors.departamento?.message}
          {...register('departamento', { onChange: () => setValue('municipio', '') })}
        >
          <option value="">Elige un departamento</option>
          {departamentos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Select
          label="Municipio"
          disabled={!departamento}
          error={errors.municipio?.message}
          {...register('municipio')}
        >
          <option value="">Elige un municipio</option>
          {opcionesMunicipio.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Input
          label="Código postal (opcional)"
          inputMode="numeric"
          error={errors.codigoPostal?.message}
          {...register('codigoPostal')}
        />
        <Input
          label="Horario (opcional)"
          ayuda="Por ejemplo: Lunes a viernes de 9:00 a 18:00."
          maxLength={200}
          error={errors.horario?.message}
          {...register('horario')}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variante="secondary" onClick={onCancelar} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" cargando={isSubmitting}>
          {sucursal ? 'Guardar cambios' : 'Crear sucursal'}
        </Button>
      </div>
    </form>
  );
}
