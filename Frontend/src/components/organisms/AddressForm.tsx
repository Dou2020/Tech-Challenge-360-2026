import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { DatosDireccion, Direccion } from '../../types/direcciones';
import { aplicarErroresApi } from '../../utils/formularios';
import { ApiError } from '../../services/http';
import { municipiosDe, nombresDepartamentos } from '../../utils/ubicaciones';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';

// Mismas reglas que Backend/API.md, "Direcciones".
const esquema = z.object({
  alias: z.string().trim().min(1, 'Ingresa un alias.').max(50, 'Máximo 50 caracteres.'),
  nombreDestinatario: z
    .string()
    .trim()
    .min(1, 'Ingresa el nombre del destinatario.')
    .max(150, 'Máximo 150 caracteres.'),
  telefono: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{8,20}$/, 'Teléfono inválido: 8 a 20 dígitos, espacios o guiones.'),
  linea1: z.string().trim().min(1, 'Ingresa la dirección.').max(200, 'Máximo 200 caracteres.'),
  linea2: z.string().trim().max(200, 'Máximo 200 caracteres.'),
  departamento: z.string().min(1, 'Elige un departamento.'),
  municipio: z.string().min(1, 'Elige un municipio.'),
  codigoPostal: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{5}$/.test(v), 'Debe tener 5 dígitos.'),
  referencias: z.string().trim().max(300, 'Máximo 300 caracteres.'),
});

type Formulario = z.infer<typeof esquema>;
const CAMPOS = Object.keys(esquema.shape) as (keyof Formulario)[];

interface Props {
  /** Dirección a editar; sin ella el formulario crea una nueva. */
  direccion?: Direccion;
  textoGuardar?: string;
  onGuardar: (datos: DatosDireccion) => Promise<unknown>;
  onCancelar?: () => void;
}

/** Formulario de dirección, reutilizable en Mis direcciones y en el checkout. */
export function AddressForm({
  direccion,
  textoGuardar = 'Guardar dirección',
  onGuardar,
  onCancelar,
}: Props) {
  const [errorApi, setErrorApi] = useState<string | null>(null);
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
      alias: direccion?.alias ?? '',
      nombreDestinatario: direccion?.nombreDestinatario ?? '',
      telefono: direccion?.telefono ?? '',
      linea1: direccion?.linea1 ?? '',
      linea2: direccion?.linea2 ?? '',
      departamento: direccion?.departamento ?? '',
      municipio: direccion?.municipio ?? '',
      codigoPostal: direccion?.codigoPostal ?? '',
      referencias: direccion?.referencias ?? '',
    },
  });

  const departamento = useWatch({ control, name: 'departamento' });
  const municipios = municipiosDe(departamento);
  // Una dirección guardada con un valor fuera de la lista no se pierde al editarla.
  const departamentos =
    direccion && !nombresDepartamentos.includes(direccion.departamento)
      ? [direccion.departamento, ...nombresDepartamentos]
      : nombresDepartamentos;
  const opcionesMunicipio =
    direccion &&
    departamento === direccion.departamento &&
    !municipios.includes(direccion.municipio)
      ? [direccion.municipio, ...municipios]
      : municipios;

  const enviar = handleSubmit(async (valores) => {
    setErrorApi(null);
    const { linea2, codigoPostal, referencias, ...obligatorios } = valores;
    const datos: DatosDireccion = {
      ...obligatorios,
      ...(linea2 ? { linea2 } : {}),
      ...(codigoPostal ? { codigoPostal } : {}),
      ...(referencias ? { referencias } : {}),
    };
    try {
      await onGuardar(datos);
    } catch (error) {
      if (!aplicarErroresApi(error, setError, CAMPOS)) {
        setErrorApi(error instanceof ApiError ? error.message : 'No se pudo guardar la dirección.');
      }
    }
  });

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      {errorApi && <InlineAlert>{errorApi}</InlineAlert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Alias"
          ayuda="Por ejemplo: Casa u Oficina."
          error={errors.alias?.message}
          {...register('alias')}
        />
        <Input
          label="Nombre del destinatario"
          autoComplete="name"
          error={errors.nombreDestinatario?.message}
          {...register('nombreDestinatario')}
        />
        <Input
          label="Teléfono"
          type="tel"
          autoComplete="tel"
          error={errors.telefono?.message}
          {...register('telefono')}
        />
      </div>
      <Input
        label="Dirección"
        autoComplete="address-line1"
        error={errors.linea1?.message}
        {...register('linea1')}
      />
      <Input
        label="Complemento (opcional)"
        autoComplete="address-line2"
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
          autoComplete="postal-code"
          error={errors.codigoPostal?.message}
          {...register('codigoPostal')}
        />
      </div>
      <Input
        label="Referencias (opcional)"
        error={errors.referencias?.message}
        {...register('referencias')}
      />

      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button variante="secondary" onClick={onCancelar} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
        <Button type="submit" cargando={isSubmitting}>
          {textoGuardar}
        </Button>
      </div>
    </form>
  );
}
