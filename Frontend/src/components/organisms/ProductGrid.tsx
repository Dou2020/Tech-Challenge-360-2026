import type { ProductoResumen } from '../../types/catalogo';
import { Skeleton } from '../atoms/Skeleton';
import { ProductCard } from '../molecules/ProductCard';

const cuadricula = 'grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4';

export function ProductGrid({ productos }: { productos: ProductoResumen[] }) {
  return (
    <ul className={cuadricula}>
      {productos.map((producto) => (
        <li key={producto.idProducto}>
          <ProductCard producto={producto} />
        </li>
      ))}
    </ul>
  );
}

/** Marcadores de carga con la misma forma que la cuadrícula. */
export function ProductGridSkeleton({ cantidad = 8 }: { cantidad?: number }) {
  return (
    <div className={cuadricula} role="status" aria-label="Cargando productos">
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="tarjeta overflow-hidden">
          <Skeleton className="aspect-square rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
