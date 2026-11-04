import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Skeleton } from '../../components/atoms';
import {
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  Notice,
  PageHeading,
} from '../../components/molecules';
import { AddressForm } from '../../components/organisms';
import {
  useActualizarDireccion,
  useCrearDireccion,
  useDirecciones,
  useEliminarDireccion,
} from '../../hooks/queries';
import type { Direccion } from '../../types/direcciones';
import { avisoExito, errorNotice, type Aviso } from '../../utils/notice';

/** Qué muestra el panel: nada, el formulario de alta o el de edición de una dirección. */
type Editor = { modo: 'cerrado' } | { modo: 'nueva' } | { modo: 'editar'; direccion: Direccion };

export default function MisDireccionesPage() {
  const direcciones = useDirecciones();
  const crear = useCrearDireccion();
  const actualizar = useActualizarDireccion();
  const eliminar = useEliminarDireccion();
  const [editor, setEditor] = useState<Editor>({ modo: 'cerrado' });
  const [aEliminar, setAEliminar] = useState<Direccion | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function guardar(datos: Parameters<typeof crear.mutateAsync>[0]) {
    if (editor.modo === 'editar') {
      await actualizar.mutateAsync({ id: editor.direccion.idDireccion, datos });
      setAviso(avisoExito('Dirección actualizada.'));
    } else {
      await crear.mutateAsync(datos);
      setAviso(avisoExito('Dirección agregada.'));
    }
    setEditor({ modo: 'cerrado' });
  }

  function confirmarBaja() {
    if (!aEliminar) return;
    eliminar.mutate(aEliminar.idDireccion, {
      onSuccess: () => setAviso(avisoExito('Dirección eliminada.')),
      onError: (error) => setAviso(errorNotice(error, 'No se pudo eliminar la dirección.')),
      onSettled: () => setAEliminar(null),
    });
  }

  return (
    <>
      <PageHeading
        titulo="Mis direcciones"
        descripcion="Direcciones de entrega de tus pedidos."
        accion={
          editor.modo === 'cerrado' && (
            <Button onClick={() => setEditor({ modo: 'nueva' })}>
              <Plus className="size-4" aria-hidden />
              Nueva dirección
            </Button>
          )
        }
      />

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      {editor.modo !== 'cerrado' && (
        <section
          aria-label={editor.modo === 'nueva' ? 'Nueva dirección' : 'Editar dirección'}
          className="tarjeta mb-6 p-5"
        >
          <h2 className="mb-4 font-semibold tracking-tight text-texto">
            {editor.modo === 'nueva' ? 'Nueva dirección' : 'Editar dirección'}
          </h2>
          <AddressForm
            key={editor.modo === 'editar' ? editor.direccion.idDireccion : 'nueva'}
            {...(editor.modo === 'editar' ? { direccion: editor.direccion } : {})}
            onGuardar={guardar}
            onCancelar={() => setEditor({ modo: 'cerrado' })}
          />
        </section>
      )}

      {direcciones.isPending && (
        <div role="status" aria-label="Cargando direcciones" className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      )}
      {direcciones.isError && (
        <ErrorState error={direcciones.error} onReintentar={() => void direcciones.refetch()} />
      )}
      {direcciones.data &&
        (direcciones.data.length === 0 ? (
          editor.modo === 'cerrado' && (
            <EmptyState
              titulo="Aún no tienes direcciones"
              descripcion="Agrega una para poder pagar tus pedidos."
              accion={
                <Button onClick={() => setEditor({ modo: 'nueva' })}>Agregar dirección</Button>
              }
            />
          )
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {direcciones.data.map((d) => (
              <li key={d.idDireccion} className="tarjeta p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium text-texto">
                    <MapPin className="size-4 text-acento" aria-hidden />
                    {d.alias}
                  </p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label={`Editar ${d.alias}`}
                      onClick={() => setEditor({ modo: 'editar', direccion: d })}
                      className="rounded-lg p-1.5 text-texto-suave transition-colors hover:bg-superficie-suave hover:text-texto"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Eliminar ${d.alias}`}
                      onClick={() => setAEliminar(d)}
                      className="rounded-lg p-1.5 text-peligro-texto transition-colors hover:bg-peligro-suave"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
                <address className="mt-2 text-sm text-texto-suave not-italic">
                  {d.nombreDestinatario} · {d.telefono}
                  <br />
                  {d.linea1}
                  {d.linea2 && `, ${d.linea2}`}
                  <br />
                  {d.municipio}, {d.departamento}
                  {d.codigoPostal && ` ${d.codigoPostal}`}
                  {d.referencias && (
                    <>
                      <br />
                      <span className="text-xs text-texto-tenue">{d.referencias}</span>
                    </>
                  )}
                </address>
              </li>
            ))}
          </ul>
        ))}

      <ConfirmationDialog
        abierto={aEliminar !== null}
        titulo="¿Eliminar esta dirección?"
        descripcion={
          aEliminar
            ? `Se eliminará "${aEliminar.alias}". Tus pedidos anteriores conservan su dirección.`
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
