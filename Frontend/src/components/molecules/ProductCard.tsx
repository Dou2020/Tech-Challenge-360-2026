import { ImageOff } from 'lucide-react';
import { Link } from 'react-router';
import type { ProductoResumen } from '../../types/catalogo';
import { Badge } from '../atoms/Badge';
import { Money } from '../atoms/Money';

/** Tarjeta de un producto del catálogo; enlaza a su detalle. */
export function ProductCard({ producto }: { producto: ProductoResumen }) {
  const hayRango = producto.precioMinimo !== producto.precioMaximo;
  return (
    <Link
      to={`/productos/${producto.idProducto}`}
      className="group tarjeta-interactiva flex flex-col overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario"
    >
      <div className="relative aspect-square overflow-hidden bg-superficie-suave">
        {producto.imagenPrincipal ? (
          <img
            src={producto.imagenPrincipal}
            alt={producto.nombre}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-texto-tenue">
            <ImageOff className="size-10" aria-hidden />
          </div>
        )}
        {!producto.disponible && (
          <div className="absolute top-3 left-3">
            <Badge tono="gris">Agotado</Badge>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium tracking-wide text-texto-tenue uppercase">
          {producto.categoria}
        </p>
        <h3 className="mt-1 font-medium text-texto transition-colors group-hover:text-acento">
          {producto.nombre}
        </h3>
        <p className="mt-auto pt-3 font-semibold text-texto">
          {hayRango && <span className="mr-1 text-xs font-normal text-texto-tenue">Desde</span>}
          <Money valor={producto.precioMinimo} />
        </p>
      </div>
    </Link>
  );
}
