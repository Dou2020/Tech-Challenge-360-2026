import { Skeleton } from '../../components/atoms';
import { EmptyState, ErrorState, PageHeading } from '../../components/molecules';
import { ConfigParameterRow } from '../../components/organisms';
import { useActualizarParametro, useConfiguracion } from '../../hooks/queries';

/** Parámetros del sistema (Administrador): cada valor se edita con validación según su tipo. */
export default function ConfiguracionPage() {
  const configuracion = useConfiguracion();
  const actualizar = useActualizarParametro();

  return (
    <>
      <PageHeading
        titulo="Configuración"
        descripcion="Parámetros del sistema. Cada cambio queda en la bitácora."
      />
      {configuracion.isPending && (
        <div role="status" aria-label="Cargando configuración" className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
      {configuracion.isError && (
        <ErrorState error={configuracion.error} onReintentar={() => void configuracion.refetch()} />
      )}
      {configuracion.data?.length === 0 && <EmptyState titulo="Sin parámetros" />}
      <div className="space-y-3">
        {configuracion.data?.map((p) => (
          <ConfigParameterRow
            key={p.clave}
            parametro={p}
            onGuardar={(clave, valor) => actualizar.mutateAsync({ clave, valor })}
          />
        ))}
      </div>
    </>
  );
}
