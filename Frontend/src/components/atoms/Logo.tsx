import { ShoppingBag } from 'lucide-react';
import { Link } from 'react-router';

/** Marca de ShopCart; enlaza al inicio. Su nombre accesible es "ShopCart". */
export function Logo({ grande = false, className = '' }: { grande?: boolean; className?: string }) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2 rounded-lg font-semibold tracking-tight text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario ${
        grande ? 'text-xl' : 'text-base'
      } ${className}`}
    >
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-lg bg-primario text-sobre-primario shadow-xs ${
          grande ? 'size-9' : 'size-8'
        }`}
      >
        <ShoppingBag className={grande ? 'size-5' : 'size-4'} />
      </span>
      ShopCart
    </Link>
  );
}
