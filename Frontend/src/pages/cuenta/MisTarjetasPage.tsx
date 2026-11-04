import { CreditCard, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Skeleton } from '../../components/atoms';
import {
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  Notice,
  PageHeading,
} from '../../components/molecules';
import { CardForm } from '../../components/organisms';
import { resumenTarjeta } from '../../config';
import {
  useCrearTarjeta,
  useEliminarTarjeta,
  useMarcarTarjetaPredeterminada,
  useTarjetas,
} from '../../hooks/queries';
import type { Tarjeta } from '../../types/tarjetas';
import { avisoExito, errorNotice, type Aviso } from '../../utils/notice';

export default function MisTarjetasPage() {
  const tarjetas = useTarjetas();
  const crear = useCrearTarjeta();
  const marcar = useMarcarTarjetaPredeterminada();
  const eliminar = useEliminarTarjeta();
  const [agregando, setAgregando] = useState(false);
  const [aEliminar, setAEliminar] = useState<Tarjeta | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function guardar(datos: Parameters<typeof crear.mutateAsync>[0]) {
    await crear.mutateAsync(datos);
    setAviso(avisoExito('Tarjeta agregada.'));
    setAgregando(false);
  }

  function marcarPredeterminada(t: Tarjeta) {
    setAviso(null);
    marcar.mutate(t.idTarjeta, {
      onSuccess: () => setAviso(avisoExito('Tarjeta marcada como predeterminada.')),
      onError: (error) => setAviso(errorNotice(error, 'No se pudo cambiar la tarjeta.')),
    });
  }

  function confirmarBaja() {
    if (!aEliminar) return;
    eliminar.mutate(aEliminar.idTarjeta, {
      onSuccess: () => setAviso(avisoExito('Tarjeta eliminada.')),
      onError: (error) => setAviso(errorNotice(error, 'No se pudo eliminar la tarjeta.')),
      onSettled: () => setAEliminar(null),
    });
  }

  return (
    <>
      <PageHeading
        titulo="Mis tarjetas"
        descripcion="Tarjetas guardadas para pagar más rápido. Solo guardamos el titular, la marca, el tipo y los 4 últimos dígitos, nunca el número completo."
        accion={
          !agregando && (
            <Button onClick={() => setAgregando(true)}>
              <Plus className="size-4" aria-hidden />
              Agregar tarjeta
            </Button>
          )
        }
      />

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      {agregando && (
        <section aria-label="Agregar tarjeta" className="tarjeta mb-6 p-5">
          <h2 className="mb-4 font-semibold tracking-tight text-texto">Agregar tarjeta</h2>
          <CardForm onGuardar={guardar} onCancelar={() => setAgregando(false)} />
        </section>
      )}

      {tarjetas.isPending && (
        <div role="status" aria-label="Cargando tarjetas" className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}
      {tarjetas.isError && (
        <ErrorState error={tarjetas.error} onReintentar={() => void tarjetas.refetch()} />
      )}
      {tarjetas.data &&
        (tarjetas.data.length === 0 ? (
          !agregando && (
            <EmptyState
              titulo="Aún no tienes tarjetas guardadas"
              descripcion="Agrega una o guárdala al pagar tu próxima compra."
              accion={<Button onClick={() => setAgregando(true)}>Agregar tarjeta</Button>}
            />
          )
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {tarjetas.data.map((t) => (
              <li key={t.idTarjeta} className="tarjeta p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium text-texto">
                    <CreditCard className="size-4 text-acento" aria-hidden />
                    {resumenTarjeta(t)}
                  </p>
                  {t.predeterminada && <Badge tono="verde">Predeterminada</Badge>}
                </div>
                <p className="mt-1 text-sm text-texto-suave">{t.titular}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!t.predeterminada && (
                    <Button
                      variante="secondary"
                      onClick={() => marcarPredeterminada(t)}
                      disabled={marcar.isPending}
                      aria-label={`Marcar como predeterminada ${resumenTarjeta(t)}`}
                    >
                      <Star className="size-4" aria-hidden />
                      Marcar como predeterminada
                    </Button>
                  )}
                  <Button
                    variante="ghost"
                    onClick={() => setAEliminar(t)}
                    aria-label={`Eliminar ${resumenTarjeta(t)}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Eliminar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      <ConfirmationDialog
        abierto={aEliminar !== null}
        titulo="¿Eliminar esta tarjeta?"
        descripcion={
          aEliminar
            ? `Se eliminará ${resumenTarjeta(aEliminar)}. Tus pedidos anteriores no cambian.`
            : undefined
        }
        textoConfirmar="Eliminar"
        cargando={eliminar.isPending}
        onConfirmar={confirmarBaja}
        onCancelar={() => setAEliminar(null)}
      />
    </>
  );
}
