import type { ReactNode } from 'react';
import type { Carrito } from '../../types/carrito';
import { Money } from '../atoms/Money';

interface Props {
  carrito: Carrito;
  /** Acciones (ir a pagar…) debajo de los montos. */
  children?: ReactNode;
}

/** Resumen con los montos que calculó el backend: no se suma ni se descuenta nada aquí. */
export function CartSummary({ carrito, children }: Props) {
  return (
    <section aria-labelledby="resumen-carrito" className="tarjeta p-5">
      <h2 id="resumen-carrito" className="font-semibold tracking-tight text-texto">
        Resumen
      </h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-texto-suave">Subtotal ({carrito.cantidadUnidades} unidades)</dt>
          <dd>
            <Money valor={carrito.subtotal} />
          </dd>
        </div>
        {Number(carrito.descuento) > 0 && (
          <div className="flex justify-between text-exito-texto">
            <dt>Descuento{carrito.cupon?.aplicado ? ` (${carrito.cupon.codigo})` : ''}</dt>
            <dd>
              − <Money valor={carrito.descuento} />
            </dd>
          </div>
        )}
        <div className="flex justify-between border-t border-borde pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>
            <Money valor={carrito.total} />
          </dd>
        </div>
        <div className="flex justify-between text-xs text-texto-tenue">
          <dt>IVA incluido ({Number(carrito.porcentajeIVA)} %)</dt>
          <dd>
            <Money valor={carrito.montoIVA} />
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-texto-tenue">El costo de envío se agrega en el pago.</p>
      {children && <div className="mt-4 space-y-2">{children}</div>}
    </section>
  );
}
