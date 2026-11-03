import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router';
import { useCarrito } from '../../hooks/queries/useCarrito';

/** Ícono del carrito con el número de unidades (lo calcula el backend: cantidadUnidades). */
export function CartButton() {
  const { data } = useCarrito();
  const unidades = data?.cantidadUnidades ?? 0;
  return (
    <Link
      to="/carrito"
      aria-label={unidades > 0 ? `Carrito, ${unidades} unidades` : 'Carrito'}
      className="relative inline-flex items-center rounded-lg p-2 text-texto-suave transition-colors hover:bg-superficie-suave hover:text-texto"
    >
      <ShoppingCart className="size-5" aria-hidden />
      {unidades > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-primario px-1.5 text-center text-[11px] leading-5 font-semibold text-sobre-primario tabular-nums ring-2 ring-fondo"
        >
          {unidades}
        </span>
      )}
    </Link>
  );
}
