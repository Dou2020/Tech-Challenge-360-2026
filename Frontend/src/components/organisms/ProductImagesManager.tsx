import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { zodResolver } from '@hookform/resolvers/zod';
import { GripVertical } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../services/http';
import type { ImagenProducto } from '../../types/catalogo';
import type { DatosImagen, DatosImagenArchivo } from '../../types/gestion';
import { aplicarErroresApi } from '../../utils/formularios';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { ConfirmationDialog } from '../molecules/ConfirmationDialog';

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];

const esquema = z.object({
  url: z.string().trim().max(500, 'Máximo 500 caracteres.'),
  archivo: z.custom<FileList | undefined>().optional(),
  esPrincipal: z.boolean(),
});
type Formulario = z.infer<typeof esquema>;

interface Props {
  imagenes: ImagenProducto[];
  onAgregar: (datos: DatosImagen) => Promise<unknown>;
  /** Sube un archivo; si no se pasa, solo se ofrece agregar por URL. */
  onSubirArchivo?: (datos: DatosImagenArchivo) => Promise<unknown>;
  onQuitar: (idImagen: number) => Promise<unknown>;
  /** Guarda el orden nuevo: recibe todos los id de imagen; la primera queda como principal. */
  onReordenar: (ids: number[]) => Promise<unknown>;
}

const instrucciones: ScreenReaderInstructions = {
  draggable:
    'Para mover la imagen, presiona espacio o Enter, usa las flechas para cambiar su posición y presiona espacio o Enter para soltarla. Escape cancela.',
};

interface TarjetaProps {
  img: ImagenProducto;
  posicion: number;
  bloqueada: boolean;
  onHacerPrincipal: () => void;
  onQuitar: () => void;
}

/** Una imagen de la grilla: asa de arrastre, posición, "Principal" (la primera) y acciones. */
function TarjetaImagen({ img, posicion, bloqueada, onHacerPrincipal, onQuitar }: TarjetaProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: img.idProductoImagen, disabled: bloqueada });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`tarjeta p-3 ${isDragging ? 'relative z-10 border-borde-fuerte opacity-70' : ''}`}
    >
      <img
        src={img.url}
        alt={`Imagen ${posicion} del producto`}
        className="h-32 w-full rounded-md bg-superficie-suave object-cover"
      />
      <p className="mt-2 truncate text-xs text-texto-suave" title={img.url}>
        {img.url}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-texto-suave">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            disabled={bloqueada}
            aria-label={`Mover imagen ${posicion}`}
            style={{ touchAction: 'none' }}
            className="cursor-grab rounded p-1 text-texto-suave hover:bg-superficie-suave disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GripVertical aria-hidden className="h-4 w-4" />
          </button>
          {posicion}
          {posicion === 1 && <Badge tono="marca">Principal</Badge>}
        </span>
        <span className="flex items-center">
          {posicion !== 1 && (
            <Button
              variante="ghost"
              className="px-2 py-1 text-xs"
              aria-label={`Hacer principal la imagen ${posicion}`}
              disabled={bloqueada}
              onClick={onHacerPrincipal}
            >
              Hacer principal
            </Button>
          )}
          <Button
            variante="ghost"
            className="px-2 py-1 text-xs"
            aria-label={`Quitar imagen ${posicion} (${img.url})`}
            onClick={onQuitar}
          >
            Quitar
          </Button>
        </span>
      </div>
    </li>
  );
}

/**
 * Imágenes de un producto: reordenar arrastrando (la primera es la principal), agregar por archivo
 * o URL (la nueva va al final) y quitar con confirmación.
 */
export function ProductImagesManager({
  imagenes,
  onAgregar,
  onSubirArchivo,
  onQuitar,
  onReordenar,
}: Props) {
  // Orden local optimista; se resincroniza cuando el servidor devuelve otra lista de imágenes.
  const [lista, setLista] = useState(imagenes);
  const [origenLista, setOrigenLista] = useState(imagenes);
  if (origenLista !== imagenes) {
    setOrigenLista(imagenes);
    setLista(imagenes);
  }
  const [guardando, setGuardando] = useState(false);
  const [errorOrden, setErrorOrden] = useState<string | null>(null);
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [origen, setOrigen] = useState<'archivo' | 'url'>(onSubirArchivo ? 'archivo' : 'url');
  const [quitando, setQuitando] = useState<ImagenProducto | null>(null);
  const [enviandoQuitar, setEnviandoQuitar] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    resolver: zodResolver(esquema),
    defaultValues: { url: '', esPrincipal: false },
  });

  async function guardarOrden(nueva: ImagenProducto[]) {
    const anterior = lista;
    setLista(nueva);
    setErrorOrden(null);
    setGuardando(true);
    try {
      await onReordenar(nueva.map((i) => i.idProductoImagen));
    } catch (error) {
      setLista(anterior);
      setErrorOrden(error instanceof ApiError ? error.message : 'No se pudo guardar el orden.');
    } finally {
      setGuardando(false);
    }
  }

  function alSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const desde = lista.findIndex((i) => i.idProductoImagen === active.id);
    const hasta = lista.findIndex((i) => i.idProductoImagen === over.id);
    if (desde < 0 || hasta < 0) return;
    void guardarOrden(arrayMove(lista, desde, hasta));
  }

  function hacerPrincipal(indice: number) {
    void guardarOrden(arrayMove(lista, indice, 0));
  }

  const posicionDe = (id: unknown) => lista.findIndex((i) => i.idProductoImagen === id) + 1;
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Imagen ${posicionDe(active.id)} levantada.`,
    onDragOver: ({ active, over }) =>
      over
        ? `Imagen ${posicionDe(active.id)} sobre la posición ${posicionDe(over.id)}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Imagen ${posicionDe(active.id)} soltada en la posición ${posicionDe(over.id)}.`
        : `Imagen ${posicionDe(active.id)} soltada sin cambios.`,
    onDragCancel: ({ active }) =>
      `Movimiento cancelado. La imagen ${posicionDe(active.id)} no cambió.`,
  };

  async function agregar(v: Formulario) {
    setErrorEnvio(null);
    try {
      if (origen === 'archivo' && onSubirArchivo) {
        const archivo = v.archivo?.[0];
        if (!archivo) {
          setError('archivo', { type: 'validate', message: 'Selecciona una imagen.' });
          return;
        }
        if (!TIPOS_IMAGEN.includes(archivo.type)) {
          setError('archivo', { type: 'validate', message: 'Solo se admiten JPEG, PNG o WebP.' });
          return;
        }
        await onSubirArchivo({ archivo, esPrincipal: v.esPrincipal });
      } else {
        if (!/^https?:\/\/\S+$/i.test(v.url)) {
          setError('url', { type: 'validate', message: 'Debe ser una URL http:// o https://.' });
          return;
        }
        await onAgregar({ url: v.url, esPrincipal: v.esPrincipal });
      }
      reset();
    } catch (error) {
      const campo = origen === 'archivo' ? 'archivo' : 'url';
      if (error instanceof ApiError && error.code === 'TIPO_ARCHIVO_NO_PERMITIDO') {
        setError('archivo', {
          type: 'server',
          message: 'El archivo no es una imagen JPEG, PNG o WebP.',
        });
      } else if (error instanceof ApiError && error.code === 'ARCHIVO_DEMASIADO_GRANDE') {
        setError('archivo', {
          type: 'server',
          message: 'La imagen supera el tamaño máximo permitido (5 MB).',
        });
      } else if (!aplicarErroresApi(error, setError, [campo]))
        setErrorEnvio(error instanceof ApiError ? error.message : 'No se pudo agregar la imagen.');
    }
  }

  async function quitar() {
    if (!quitando) return;
    setEnviandoQuitar(true);
    setErrorEnvio(null);
    try {
      await onQuitar(quitando.idProductoImagen);
    } catch (error) {
      setErrorEnvio(error instanceof ApiError ? error.message : 'No se pudo quitar la imagen.');
    } finally {
      setEnviandoQuitar(false);
      setQuitando(null);
    }
  }

  return (
    <div className="space-y-4">
      {lista.length === 0 ? (
        <p className="text-sm text-texto-suave">Este producto aún no tiene imágenes.</p>
      ) : (
        <>
          {lista.length > 1 && (
            <p className="text-xs text-texto-suave">
              Arrastra las imágenes para ordenarlas: la primera es la principal.
            </p>
          )}
          <DndContext
            sensors={sensores}
            collisionDetection={closestCenter}
            onDragEnd={alSoltar}
            accessibility={{ announcements: anuncios, screenReaderInstructions: instrucciones }}
          >
            <SortableContext
              items={lista.map((i) => i.idProductoImagen)}
              strategy={rectSortingStrategy}
              disabled={guardando || lista.length < 2}
            >
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lista.map((img, indice) => (
                  <TarjetaImagen
                    key={img.idProductoImagen}
                    img={img}
                    posicion={indice + 1}
                    bloqueada={guardando || lista.length < 2}
                    onHacerPrincipal={() => hacerPrincipal(indice)}
                    onQuitar={() => setQuitando(img)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {errorOrden && <InlineAlert>{errorOrden}</InlineAlert>}
        </>
      )}

      <form onSubmit={(e) => void handleSubmit(agregar)(e)} noValidate className="space-y-3">
        {onSubirArchivo && (
          <fieldset className="flex gap-4 text-sm text-texto-suave">
            <legend className="sr-only">Origen de la imagen</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="origen-imagen"
                checked={origen === 'archivo'}
                onChange={() => setOrigen('archivo')}
              />
              Subir archivo
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="origen-imagen"
                checked={origen === 'url'}
                onChange={() => setOrigen('url')}
              />
              Usar una URL
            </label>
          </fieldset>
        )}
        <div>
          {origen === 'archivo' ? (
            <Input
              label="Archivo de imagen"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              ayuda="JPEG, PNG o WebP, hasta 5 MB."
              error={errors.archivo?.message}
              {...register('archivo')}
            />
          ) : (
            <Input
              label="URL de la imagen"
              type="url"
              placeholder="https://…"
              error={errors.url?.message}
              {...register('url')}
            />
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-texto-suave">
          <input
            type="checkbox"
            aria-describedby="ayuda-imagen-principal"
            {...register('esPrincipal')}
          />
          Imagen principal
        </label>
        <p id="ayuda-imagen-principal" className="-mt-1 text-xs text-texto-tenue">
          Si la marcas, la imagen nueva queda en primer lugar.
        </p>
        {errorEnvio && <InlineAlert>{errorEnvio}</InlineAlert>}
        <Button type="submit" variante="secondary" cargando={isSubmitting}>
          Agregar imagen
        </Button>
      </form>

      <ConfirmationDialog
        abierto={quitando !== null}
        titulo="¿Quitar esta imagen?"
        descripcion={
          quitando?.esPrincipal
            ? 'Es la imagen principal: la siguiente pasará a ser la principal.'
            : undefined
        }
        textoConfirmar="Quitar imagen"
        cargando={enviandoQuitar}
        onConfirmar={() => void quitar()}
        onCancelar={() => setQuitando(null)}
      />
    </div>
  );
}
