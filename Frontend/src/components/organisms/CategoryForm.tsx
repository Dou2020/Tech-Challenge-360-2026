import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../services/http';
import type { CategoriaGestion, DatosCategoria } from '../../types/gestion';
import { aplicarErroresApi } from '../../utils/formularios';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';

const esquema = z.object({
  nombre: z.string().trim().min(1, 'Ingresa el nombre.').max(100, 'Máximo 100 caracteres.'),
  descripcion: z.string().trim().max(500, 'Máximo 500 caracteres.'),
});
type Formulario = z.infer<typeof esquema>;
const CAMPOS = ['nombre', 'descripcion'] as const;

interface Props {
  /** Categoría a editar; sin ella crea una nueva. */
  categoria?: CategoriaGestion;
  /** Guarda; debe rechazar con el ApiError si falla. */
  onGuardar: (datos: DatosCategoria) => Promise<unknown>;
  onCancelar: () => void;
}

/** Crear o editar una categoría. Un nombre repetido (409 DUPLICADO) se marca en el campo. */
export function CategoryForm({ categoria, onGuardar, onCancelar }: Props) {
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    resolver: zodResolver(esquema),
    defaultValues: { nombre: categoria?.nombre ?? '', descripcion: categoria?.descripcion ?? '' },
  });

  async function enviar(valores: Formulario) {
    setErrorEnvio(null);
    try {
      await onGuardar({
        nombre: valores.nombre,
        ...(valores.descripcion ? { descripcion: valores.descripcion } : {}),
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DUPLICADO') {
        setError('nombre', { type: 'server', message: 'Ya existe una categoría con ese nombre.' });
      } else if (!aplicarErroresApi(error, setError, CAMPOS)) {
        setErrorEnvio(
          error instanceof ApiError ? error.message : 'No se pudo guardar la categoría.',
        );
      }
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(enviar)(e)} noValidate className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Nombre"
          maxLength={100}
          error={errors.nombre?.message}
          {...register('nombre')}
        />
        <Input
          label="Descripción (opcional)"
          maxLength={500}
          error={errors.descripcion?.message}
          {...register('descripcion')}
        />
      </div>
      {errorEnvio && <InlineAlert>{errorEnvio}</InlineAlert>}
      <div className="flex justify-end gap-2">
        <Button variante="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" cargando={isSubmitting}>
          {categoria ? 'Guardar cambios' : 'Crear categoría'}
        </Button>
      </div>
    </form>
  );
}
