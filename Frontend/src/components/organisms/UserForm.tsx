import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../services/http';
import type {
  DatosUsuarioEdicion,
  DatosUsuarioNuevo,
  UsuarioAdmin,
} from '../../types/administracion';
import type { Rol } from '../../types/auth';
import { aplicarErroresApi } from '../../utils/formularios';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';

const base = {
  nombre: z.string().trim().min(1, 'Ingresa el nombre.').max(100, 'Máximo 100 caracteres.'),
  apellido: z.string().trim().min(1, 'Ingresa el apellido.').max(100, 'Máximo 100 caracteres.'),
  telefono: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^\+?[\d\s-]{8,20}$/.test(v),
      'Teléfono inválido: 8 a 20 dígitos, espacios o guiones.',
    ),
  rol: z.enum(['Cliente', 'Operador', 'Administrador']),
};

const esquemaNuevo = z.object({
  ...base,
  correo: z.email('Ingresa un correo válido.').max(150, 'Máximo 150 caracteres.'),
});
const esquemaEdicion = z.object({ ...base, correo: z.string() });
type Formulario = z.infer<typeof esquemaNuevo>;
const CAMPOS = ['correo', 'nombre', 'apellido', 'telefono', 'rol'] as const;

type Props = {
  onCancelar: () => void;
} & (
  | { usuario?: undefined; onGuardar: (datos: DatosUsuarioNuevo) => Promise<unknown> }
  | { usuario: UsuarioAdmin; onGuardar: (datos: DatosUsuarioEdicion) => Promise<unknown> }
);

/** Crear un Operador o Administrador, o editar nombre, apellido, teléfono y rol de un usuario. */
export function UserForm(props: Props) {
  const { usuario, onCancelar } = props;
  const editando = usuario !== undefined;
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    resolver: zodResolver(editando ? esquemaEdicion : esquemaNuevo),
    defaultValues: {
      correo: usuario?.correo ?? '',
      nombre: usuario?.nombre ?? '',
      apellido: usuario?.apellido ?? '',
      telefono: usuario?.telefono ?? '',
      rol: usuario?.rol ?? 'Operador',
    },
  });

  async function enviar(v: Formulario) {
    setErrorEnvio(null);
    const telefono = v.telefono ? { telefono: v.telefono } : {};
    try {
      if (props.usuario) {
        await props.onGuardar({ nombre: v.nombre, apellido: v.apellido, ...telefono, rol: v.rol });
      } else {
        await props.onGuardar({
          correo: v.correo,
          nombre: v.nombre,
          apellido: v.apellido,
          ...telefono,
          rol: v.rol === 'Administrador' ? 'Administrador' : 'Operador',
        });
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DUPLICADO') {
        setError('correo', { type: 'server', message: 'Ya existe un usuario con ese correo.' });
      } else if (error instanceof ApiError && error.code === 'EN_USO') {
        setError('rol', {
          type: 'server',
          message:
            'No se puede quitar el rol de Administrador a ti mismo ni al último Administrador activo.',
        });
      } else if (!aplicarErroresApi(error, setError, CAMPOS)) {
        setErrorEnvio(error instanceof ApiError ? error.message : 'No se pudo guardar el usuario.');
      }
    }
  }

  const roles: Rol[] = editando
    ? ['Cliente', 'Operador', 'Administrador']
    : ['Operador', 'Administrador'];

  return (
    <form onSubmit={(e) => void handleSubmit(enviar)(e)} noValidate className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          label="Nombre"
          maxLength={100}
          error={errors.nombre?.message}
          {...register('nombre')}
        />
        <Input
          label="Apellido"
          maxLength={100}
          error={errors.apellido?.message}
          {...register('apellido')}
        />
        <Input
          label="Teléfono (opcional)"
          type="tel"
          error={errors.telefono?.message}
          {...register('telefono')}
        />
        <Input
          label="Correo"
          type="email"
          disabled={editando}
          error={errors.correo?.message}
          {...register('correo')}
        />
        <Select label="Rol" error={errors.rol?.message} {...register('rol')}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </div>
      {!editando && (
        <p className="text-sm text-texto-suave">
          No se define contraseña: el usuario recibirá un correo con un enlace para crearla.
        </p>
      )}
      {errorEnvio && <InlineAlert>{errorEnvio}</InlineAlert>}
      <div className="flex justify-end gap-2">
        <Button variante="secondary" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" cargando={isSubmitting}>
          {editando ? 'Guardar cambios' : 'Crear usuario'}
        </Button>
      </div>
    </form>
  );
}
