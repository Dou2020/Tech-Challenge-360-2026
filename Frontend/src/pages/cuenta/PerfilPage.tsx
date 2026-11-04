import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Input, Skeleton } from '../../components/atoms';
import { ErrorState, Notice, PageHeading } from '../../components/molecules';
import { useActualizarPerfil, useCambiarContrasena, usePerfil } from '../../hooks/queries';
import { ApiError } from '../../services/http';
import type { Perfil } from '../../types/perfil';
import { esquemaContrasenaNueva } from '../../utils/contrasena';
import { aplicarErroresApi } from '../../utils/formularios';
import { avisoExito, errorNotice, type Aviso } from '../../utils/notice';

const esquemaDatos = z.object({
  nombre: z.string().trim().min(1, 'Ingresa tu nombre.').max(100, 'Máximo 100 caracteres.'),
  apellido: z.string().trim().min(1, 'Ingresa tu apellido.').max(100, 'Máximo 100 caracteres.'),
  telefono: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\+?[\d\s-]{8,20}$/.test(v), 'Teléfono inválido (8 a 20 dígitos).'),
});
type Datos = z.infer<typeof esquemaDatos>;

const esquemaContrasena = z
  .object({
    contrasenaActual: z.string().min(1, 'Ingresa tu contraseña actual.'),
    contrasenaNueva: esquemaContrasenaNueva,
    confirmacion: z.string().min(1, 'Confirma la contraseña nueva.'),
  })
  .refine((v) => v.contrasenaNueva === v.confirmacion, {
    path: ['confirmacion'],
    message: 'Las contraseñas no coinciden.',
  })
  .refine((v) => v.contrasenaNueva !== v.contrasenaActual, {
    path: ['contrasenaNueva'],
    message: 'Debe ser distinta de la actual.',
  });
type DatosContrasena = z.infer<typeof esquemaContrasena>;

function FormularioDatos({ perfil }: { perfil: Perfil }) {
  const actualizar = useActualizarPerfil();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Datos>({
    resolver: zodResolver(esquemaDatos),
    defaultValues: {
      nombre: perfil.nombre,
      apellido: perfil.apellido,
      telefono: perfil.telefono ?? '',
    },
  });

  const enviar = handleSubmit(async ({ nombre, apellido, telefono }) => {
    setAviso(null);
    try {
      await actualizar.mutateAsync({ nombre, apellido, ...(telefono ? { telefono } : {}) });
      setAviso(avisoExito('Datos actualizados.'));
    } catch (error) {
      if (!aplicarErroresApi(error, setError, ['nombre', 'apellido', 'telefono'])) {
        setAviso(errorNotice(error, 'No se pudieron guardar los datos.'));
      }
    }
  });

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-labelledby="titulo-datos"
      className="tarjeta space-y-4 p-5"
    >
      <h2 id="titulo-datos" className="font-semibold tracking-tight text-texto">
        Mis datos
      </h2>
      {aviso && <Notice aviso={aviso} onCerrar={() => setAviso(null)} />}
      <Input
        label="Correo"
        value={perfil.correo}
        readOnly
        disabled
        ayuda="El correo no se puede cambiar."
      />
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
        label="Teléfono (opcional)"
        type="tel"
        error={errors.telefono?.message}
        {...register('telefono')}
      />
      <div className="flex justify-end">
        <Button type="submit" cargando={isSubmitting}>
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

function FormularioContrasena() {
  const cambiar = useCambiarContrasena();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DatosContrasena>({ resolver: zodResolver(esquemaContrasena) });

  const enviar = handleSubmit(async ({ contrasenaActual, contrasenaNueva }) => {
    setAviso(null);
    try {
      await cambiar.mutateAsync({ contrasenaActual, contrasenaNueva });
      reset();
      setAviso(avisoExito('Contraseña actualizada. Las demás sesiones se cerraron.'));
    } catch (error) {
      // La actual incorrecta llega como 400 VALIDACION con details en contrasenaActual.
      const enCampo = aplicarErroresApi(error, setError, ['contrasenaActual', 'contrasenaNueva']);
      if (!enCampo) {
        if (error instanceof ApiError && error.code === 'VALIDACION') {
          setError('contrasenaActual', { type: 'server', message: error.message });
        } else {
          setAviso(errorNotice(error, 'No se pudo cambiar la contraseña.'));
        }
      }
    }
  });

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-labelledby="titulo-contrasena"
      className="tarjeta space-y-4 p-5"
    >
      <h2 id="titulo-contrasena" className="font-semibold tracking-tight text-texto">
        Cambiar contraseña
      </h2>
      {aviso && <Notice aviso={aviso} onCerrar={() => setAviso(null)} />}
      <Input
        label="Contraseña actual"
        type="password"
        autoComplete="current-password"
        error={errors.contrasenaActual?.message}
        {...register('contrasenaActual')}
      />
      <Input
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        ayuda="Mínimo 8 caracteres, con al menos una letra y un número."
        error={errors.contrasenaNueva?.message}
        {...register('contrasenaNueva')}
      />
      <Input
        label="Confirmar contraseña nueva"
        type="password"
        autoComplete="new-password"
        error={errors.confirmacion?.message}
        {...register('confirmacion')}
      />
      <div className="flex justify-end">
        <Button type="submit" cargando={isSubmitting}>
          Cambiar contraseña
        </Button>
      </div>
    </form>
  );
}

export default function PerfilPage() {
  const perfil = usePerfil();
  return (
    <>
      <PageHeading titulo="Mi perfil" />
      {perfil.isPending && (
        <div role="status" aria-label="Cargando perfil" className="space-y-3">
          <Skeleton className="h-48 w-full" />
        </div>
      )}
      {perfil.isError && (
        <ErrorState error={perfil.error} onReintentar={() => void perfil.refetch()} />
      )}
      {perfil.data && (
        <div className="grid max-w-2xl gap-6">
          <FormularioDatos perfil={perfil.data} />
          <FormularioContrasena />
        </div>
      )}
    </>
  );
}
