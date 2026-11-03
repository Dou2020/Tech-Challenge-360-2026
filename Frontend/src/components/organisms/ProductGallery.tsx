import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import type { ImagenProducto } from '../../types/catalogo';

/** Imagen principal más miniaturas. La API trae la principal primero. */
export function ProductGallery({
  imagenes,
  nombre,
}: {
  imagenes: ImagenProducto[];
  nombre: string;
}) {
  const [elegida, setElegida] = useState(0);
  const actual = imagenes[elegida];

  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-2xl bg-superficie-suave ring-1 ring-borde">
        {actual ? (
          <img src={actual.url} alt={nombre} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-texto-tenue">
            <ImageOff className="size-16" aria-label="Sin imagen" />
          </div>
        )}
      </div>
      {imagenes.length > 1 && (
        <ul className="mt-3 flex gap-2" aria-label="Imágenes del producto">
          {imagenes.map((imagen, i) => (
            <li key={imagen.idProductoImagen}>
              <button
                type="button"
                aria-label={`Ver imagen ${i + 1}`}
                aria-pressed={i === elegida}
                onClick={() => setElegida(i)}
                className={`size-16 overflow-hidden rounded-xl ring-2 ring-offset-2 ring-offset-fondo transition ${
                  i === elegida ? 'ring-primario' : 'ring-transparent hover:ring-borde-fuerte'
                }`}
              >
                <img src={imagen.url} alt="" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
