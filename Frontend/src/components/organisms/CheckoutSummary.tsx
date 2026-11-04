import type { ResumenCheckout } from '../../types/checkout';
import { Money } from '../atoms/Money';

/** Resumen del pago con los montos finales del backend (subtotal, descuento, envío, total, IVA). */
export function CheckoutSummary({ resumen }: { resumen: ResumenCheckout }) {
  return (
    <section aria-labelledby="resumen-pago" className="tarjeta p-5">
      <h2 id="resumen-pago" className="font-semibold tracking-tight text-texto">
        Resumen del pedido
      </h2>
      <ul className="mt-4 divide-y divide-borde text-sm">
        {resumen.items.map((linea) => (
          <li key={linea.idCarritoDetalle} className="flex justify-between gap-4 py-2">
            <span>
              {linea.cantidad} × {linea.producto}
              {linea.variante && <span className="text-texto-tenue"> ({linea.variante})</span>}
            </span>
            <Money valor={linea.subtotal} />
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-2 border-t border-borde pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-texto-suave">Subtotal</dt>
          <dd>
            <Money valor={resumen.subtotal} />
          </dd>
        </div>
        {Number(resumen.descuento) > 0 && (
          <div className="flex justify-between text-exito-texto">
            <dt>Descuento{resumen.cupon?.aplicado ? ` (${resumen.cupon.codigo})` : ''}</dt>
            <dd>
              − <Money valor={resumen.descuento} />
            </dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-texto-suave">
            Envío{resumen.metodoEnvio ? ` (${resumen.metodoEnvio.nombre})` : ''}
          </dt>
          <dd>
            <Money valor={resumen.costoEnvio} />
          </dd>
        </div>
        <div className="flex justify-between border-t border-borde pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>
            <Money valor={resumen.total} />
          </dd>
        </div>
        <div className="flex justify-between text-xs text-texto-tenue">
          <dt>IVA incluido ({Number(resumen.porcentajeIVA)} %)</dt>
          <dd>
            <Money valor={resumen.montoIVA} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
