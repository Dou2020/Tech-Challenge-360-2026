import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button, InlineAlert, Input } from '../../components/atoms';
import { authApi } from '../../services/api/auth';
import type { DatosRegistro } from '../../types/auth';
import { ApiError } from '../../services/http';
import { aplicarErroresApi } from '../../utils/formularios';

const esquema = z.object({
  nombre: z.string().trim().min(1, 'Ingresa tu nombre.').max(100, 'Máximo 100 caracteres.'),
  apellido: z.string().trim().min(1, 'Ingresa tu apellido.').max(100, 'Máximo 100 caracteres.'),
  correo: z.email('Ingresa un correo válido.').max(150, 'Máximo 150 caracteres.'),
  telefono: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\+?[\d\s-]{8,20}$/.test(v), 'Teléfono inválido (8 a 20 dígitos).'),
});

type Formulario = z.infer<typeof esquema>;
const CAMPOS = ['nombre', 'apellido', 'correo', 'telefono'] as const;

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'DEMASIADAS_SOLICITUDES') {
      return 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.';
    }
    if (error.code === 'SERVICIO_NO_DISPONIBLE') {
      return 'El servicio no está disponible por ahora. Inténtalo de nuevo más tarde.';
    }
    return error.message;
  }
  return 'No se pudo crear la cuenta.';
}

export default function RegistroPage() {
  const [params] = useSearchParams();
  const registro = useMutation({ mutationFn: (datos: DatosRegistro) => authApi.registro(datos) });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({ resolver: zodResolver(esquema), defaultValues: { telefono: '' } });

  const enviar = handleSubmit(async ({ telefono, ...datos }) => {
    try {
      await registro.mutateAsync({ ...datos, ...(telefono ? { telefono } : {}) });
    } catch (error) {
      aplicarErroresApi(error, setError, CAMPOS);
    }
  });

  const redirect = params.get('redirect');
  const destinoLogin = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';

  if (registro.isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto size-10 text-acento" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight text-texto">Revisa tu correo</h1>
        <p role="status" className="text-sm text-texto-suave">
          {registro.data.mensaje}
        </p>
        <p className="text-sm text-texto-suave">
          Crea tu contraseña desde el enlace que te enviamos y luego inicia sesión.
        </p>
        <Link
          to={destinoLogin}
          className="inline-block text-sm font-medium text-acento hover:underline"
        >
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  // Un error con details (VALIDACION) ya quedó en sus campos; el resto se muestra como alerta.
  const errorGeneral =
    registro.error && !(registro.error instanceof ApiError && registro.error.details.length > 0)
      ? mensajeDeError(registro.error)
      : null;

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-texto">Crear cuenta</h1>
      <p className="text-sm text-texto-suave">
        Te enviaremos un correo con un enlace para que crees tu contraseña.
      </p>

      {errorGeneral && <InlineAlert>{errorGeneral}</InlineAlert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre"
          autoComplete="given-name"
          error={errors.nombre?.message}
          {...register('nombre')}
        />
        <Input
          label="Apellido"
          autoComplete="family-name"
          error={errors.apellido?.message}
          {...register('apellido')}
        />
      </div>
      <Input
        label="Correo"
        type="email"
        autoComplete="email"
        error={errors.correo?.message}
        {...register('correo')}
      />
      <Input
        label="Teléfono (opcional)"
        type="tel"
        autoComplete="tel"
        error={errors.telefono?.message}
        {...register('telefono')}
      />

      <Button type="submit" cargando={isSubmitting} className="w-full">
        Crear cuenta
      </Button>

      <p className="text-center text-sm text-texto-suave">
        ¿Ya tienes cuenta?{' '}
        <Link to={destinoLogin} className="font-medium text-acento hover:underline">
          Iniciar sesión
        </Link>
      </p>
    </form>
  );
}
