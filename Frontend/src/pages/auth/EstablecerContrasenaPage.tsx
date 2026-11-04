import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { Button, InlineAlert, Input } from '../../components/atoms';
import { ErrorState, PantallaCarga } from '../../components/molecules';
import { authApi } from '../../services/api/auth';
import { ApiError } from '../../services/http';
import { esquemaContrasenaNueva } from '../../utils/contrasena';
import { aplicarErroresApi } from '../../utils/formularios';
import { avisoExito } from '../../utils/notice';

const esquema = z
  .object({
    contrasena: esquemaContrasenaNueva,
    confirmacion: z.string().min(1, 'Confirma la contraseña.'),
  })
  .refine((v) => v.contrasena === v.confirmacion, {
    path: ['confirmacion'],
    message: 'Las contraseñas no coinciden.',
  });
type Formulario = z.infer<typeof esquema>;

/** El token viaja en el fragmento (#token=…) para que no llegue a logs ni a otros sitios. */
function tokenDelHash(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? '';
}

/** Crear (CREAR) o restablecer (RESTABLECER) la contraseña con el enlace del correo. */
export default function EstablecerContrasenaPage() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const token = tokenDelHash(hash);

  const verificacion = useQuery({
    queryKey: ['contrasena', 'verificar', token],
    queryFn: () => authApi.verificarToken(token),
    enabled: token !== '',
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const establecer = useMutation({
    mutationFn: (contrasena: string) => authApi.establecerContrasena(token, contrasena),
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  const enviar = handleSubmit(async ({ contrasena }) => {
    try {
      await establecer.mutateAsync(contrasena);
      navigate('/login', {
        replace: true,
        state: { aviso: avisoExito('Contraseña guardada. Ya puedes iniciar sesión.') },
      });
    } catch (error) {
      aplicarErroresApi(error, setError, ['contrasena']);
    }
  });

  const enlaceInvalido = (
    <div className="space-y-4">
      <ErrorState mensaje="El enlace no es válido, ya se usó o venció." />
      <Link
        to="/recuperar-contrasena"
        className="block text-center text-sm font-medium text-acento hover:underline"
      >
        Solicitar un enlace nuevo
      </Link>
    </div>
  );

  if (token === '') return enlaceInvalido;
  if (verificacion.isPending) return <PantallaCarga />;
  if (verificacion.isError) {
    const error = verificacion.error;
    if (error instanceof ApiError && error.code === 'TOKEN_CONTRASENA_INVALIDO') {
      return enlaceInvalido;
    }
    return <ErrorState error={error} onReintentar={() => void verificacion.refetch()} />;
  }

  const { proposito, correo } = verificacion.data;
  const errorEnvio = establecer.error;
  const errorGeneral =
    errorEnvio && !(errorEnvio instanceof ApiError && errorEnvio.details.length > 0)
      ? errorEnvio instanceof ApiError && errorEnvio.code === 'TOKEN_CONTRASENA_INVALIDO'
        ? 'El enlace ya no es válido. Solicita uno nuevo.'
        : errorEnvio instanceof ApiError
          ? errorEnvio.message
          : 'No se pudo guardar la contraseña.'
      : null;

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-texto">
        {proposito === 'CREAR' ? 'Crea tu contraseña' : 'Restablece tu contraseña'}
      </h1>
      <p className="text-sm text-texto-suave">
        Cuenta: <span className="font-medium">{correo}</span>
      </p>

      {errorGeneral && <InlineAlert>{errorGeneral}</InlineAlert>}

      <Input
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        ayuda="Mínimo 8 caracteres, con al menos una letra y un número."
        error={errors.contrasena?.message}
        {...register('contrasena')}
      />
      <Input
        label="Confirmar contraseña"
        type="password"
        autoComplete="new-password"
        error={errors.confirmacion?.message}
        {...register('confirmacion')}
      />

      <Button type="submit" cargando={isSubmitting} className="w-full">
        Guardar contraseña
      </Button>
    </form>
  );
}
