import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useAuth } from '../../auth/useAuth';
import { Button, InlineAlert, Input } from '../../components/atoms';
import { Notice } from '../../components/molecules';
import { inicioPorRol } from '../../config';
import { ApiError } from '../../services/http';
import type { Aviso } from '../../utils/notice';

const esquema = z.object({
  correo: z.email('Ingresa un correo válido.'),
  contrasena: z.string().min(1, 'Ingresa tu contraseña.'),
});

type Formulario = z.infer<typeof esquema>;

/** Solo acepta rutas internas para evitar redirecciones a otros sitios. */
function destinoSeguro(redirect: string | null): string | null {
  return redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
}

/** Mensaje para el usuario según el código de error del login. */
function mensajeDeLogin(error: unknown): string {
  if (!(error instanceof ApiError)) return 'No se pudo iniciar sesión.';
  if (error.code === 'CUENTA_BLOQUEADA') {
    return 'Demasiados intentos fallidos. Tu acceso está bloqueado temporalmente; inténtalo de nuevo en unos 15 minutos.';
  }
  if (error.code === 'USUARIO_INACTIVO') {
    return 'Tu cuenta está desactivada. Contacta a un administrador.';
  }
  return error.message;
}

export default function LoginPage() {
  const { iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Aviso con el que otra pantalla redirige (p. ej. contraseña creada).
  const aviso = (useLocation().state as { aviso?: Aviso } | null)?.aviso;
  const [errorApi, setErrorApi] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  const enviar = handleSubmit(async ({ correo, contrasena }) => {
    setErrorApi(null);
    try {
      const usuario = await iniciarSesion(correo, contrasena);
      navigate(destinoSeguro(params.get('redirect')) ?? inicioPorRol(usuario.rol), {
        replace: true,
      });
    } catch (error) {
      setErrorApi(mensajeDeLogin(error));
    }
  });

  const redirect = params.get('redirect');
  const destinoRegistro = redirect
    ? `/registro?redirect=${encodeURIComponent(redirect)}`
    : '/registro';

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-texto">Iniciar sesión</h1>

      {aviso && <Notice aviso={aviso} />}

      {errorApi && <InlineAlert>{errorApi}</InlineAlert>}

      <Input
        label="Correo"
        type="email"
        autoComplete="email"
        error={errors.correo?.message}
        {...register('correo')}
      />
      <Input
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        error={errors.contrasena?.message}
        {...register('contrasena')}
      />

      <p className="text-right text-sm">
        <Link to="/recuperar-contrasena" className="font-medium text-acento hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>

      <Button type="submit" cargando={isSubmitting} className="w-full">
        Entrar
      </Button>

      <p className="text-center text-sm text-texto-suave">
        ¿No tienes cuenta?{' '}
        <Link to={destinoRegistro} className="font-medium text-acento hover:underline">
          Crear una cuenta
        </Link>
      </p>
    </form>
  );
}
