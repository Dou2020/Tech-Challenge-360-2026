import { zodResolver } from '@hookform/resolvers/zod';
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
  orden: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^\d+$/.test(v) && Number(v) <= 255),
      'Debe ser un entero entre 0 y 255.',
    ),
  esPrincipal: z.boolean(),
});
type Formulario = z.infer<typeof esquema>;

interface Props {
  imagenes: ImagenProducto[];
  onAgregar: (datos: DatosImagen) => Promise<unknown>;
  /** Sube un archivo; si no se pasa, solo se ofrece agregar por URL. */
  onSubirArchivo?: (datos: DatosImagenArchivo) => Promise<unknown>;
  onQuitar: (idImagen: number) => Promise<unknown>;
}

/** Imágenes de un producto: agregar por archivo o URL (con orden y principal) y quitar con confirmación. */
export function ProductImagesManager({ imagenes, onAgregar, onSubirArchivo, onQuitar }: Props) {
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
    defaultValues: { url: '', orden: '', esPrincipal: false },
  });

  async function agregar(v: Formulario) {
    setErrorEnvio(null);
    const orden = v.orden === '' ? 0 : Number(v.orden);
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
        await onSubirArchivo({ archivo, orden, esPrincipal: v.esPrincipal });
      } else {
        if (!/^https?:\/\/\S+$/i.test(v.url)) {
          setError('url', { type: 'validate', message: 'Debe ser una URL http:// o https://.' });
          return;
        }
        await onAgregar({ url: v.url, orden, esPrincipal: v.esPrincipal });
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
      } else if (!aplicarErroresApi(error, setError, [campo, 'orden']))
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
      {imagenes.length === 0 ? (
        <p className="text-sm text-texto-suave">Este producto aún no tiene imágenes.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {imagenes.map((img) => (
            <li key={img.idProductoImagen} className="rounded-lg border border-borde p-3">
              <img
                src={img.url}
                alt={`Imagen ${img.orden} del producto`}
                className="h-32 w-full rounded-md bg-superficie-suave object-cover"
              />
              <p className="mt-2 truncate text-xs text-texto-suave" title={img.url}>
                {img.url}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-texto-suave">
                  Orden {img.orden}
                  {img.esPrincipal && <Badge tono="marca">Principal</Badge>}
                </span>
                <Button
                  variante="ghost"
                  className="px-2 py-1 text-xs"
                  aria-label={`Quitar imagen ${img.orden} (${img.url})`}
                  onClick={() => setQuitando(img)}
                >
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
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
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
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
          <Input
            label="Orden"
            inputMode="numeric"
            placeholder="0"
            error={errors.orden?.message}
            {...register('orden')}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-texto-suave">
          <input type="checkbox" {...register('esPrincipal')} />
          Imagen principal
        </label>
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
            ? 'Es la imagen principal: la siguiente por orden pasará a serlo.'
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
