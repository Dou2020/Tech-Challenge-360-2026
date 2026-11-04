import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button, InlineAlert, Input } from '../../components/atoms';
import { authApi } from '../../services/api/auth';
import { ApiError } from '../../services/http';
import { aplicarErroresApi } from '../../utils/formularios';

const esquema = z.object({ correo: z.email('Ingresa un correo válido.') });
type Formulario = z.infer<typeof esquema>;

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
  return 'No se pudo enviar la solicitud.';
}

/** Pide el enlace para restablecer la contraseña. La respuesta no revela si la cuenta existe. */
export default function RecuperarContrasenaPage() {
  const olvido = useMutation({ mutationFn: (correo: string) => authApi.olvido(correo) });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  const enviar = handleSubmit(async ({ correo }) => {
    try {
      await olvido.mutateAsync(correo);
    } catch (error) {
      aplicarErroresApi(error, setError, ['correo']);
    }
  });

  if (olvido.isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto size-10 text-acento" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight text-texto">Revisa tu correo</h1>
        <p role="status" className="text-sm text-texto-suave">
          Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva.
        </p>
        <Link to="/login" className="inline-block text-sm font-medium text-acento hover:underline">
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  const errorGeneral =
    olvido.error && !(olvido.error instanceof ApiError && olvido.error.details.length > 0)
      ? mensajeDeError(olvido.error)
      : null;

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-texto">Recuperar contraseña</h1>
      <p className="text-sm text-texto-suave">
        Ingresa tu correo y te enviaremos un enlace para crear una contraseña nueva.
      </p>

      {errorGeneral && <InlineAlert>{errorGeneral}</InlineAlert>}

      <Input
        label="Correo"
        type="email"
        autoComplete="email"
        error={errors.correo?.message}
        {...register('correo')}
      />

      <Button type="submit" cargando={isSubmitting} className="w-full">
        Enviar enlace
      </Button>

      <p className="text-center text-sm text-texto-suave">
        <Link to="/login" className="font-medium text-acento hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
