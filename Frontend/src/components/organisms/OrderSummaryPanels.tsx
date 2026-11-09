import type { PedidoDetalle } from '../../types/pedidos';
import { formatearFecha } from '../../utils/format';
import { Money } from '../atoms/Money';

/** Montos, entrega y pago de un pedido. Muestra lo que devuelve la API, sin recalcular. */
export function OrderSummaryPanels({ pedido: p }: { pedido: PedidoDetalle }) {
  return (
    <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
      <section aria-labelledby="titulo-montos" className="tarjeta p-5">
        <h2 id="titulo-montos" className="font-semibold tracking-tight text-texto">
          Montos
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-texto-suave">Subtotal</dt>
            <dd>
              <Money valor={p.subtotal} />
            </dd>
          </div>
          {Number(p.descuento) > 0 && (
            <div className="flex justify-between text-exito-texto">
              <dt>Descuento{p.cupon ? ` (${p.cupon.codigo})` : ''}</dt>
              <dd>
                − <Money valor={p.descuento} />
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-texto-suave">Envío ({p.metodoEnvio.nombre})</dt>
            <dd>
              <Money valor={p.costoEnvio} />
            </dd>
          </div>
          <div className="flex justify-between border-t border-borde pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>
              <Money valor={p.total} />
            </dd>
          </div>
          <div className="flex justify-between text-xs text-texto-tenue">
            <dt>IVA incluido</dt>
            <dd>
              <Money valor={p.montoIVA} />
            </dd>
          </div>
          {Number(p.montoReembolsado) > 0 && (
            <div className="flex justify-between text-sm text-aviso-texto">
              <dt>Reembolsado</dt>
              <dd>
                <Money valor={p.montoReembolsado} />
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section aria-labelledby="titulo-entrega" className="tarjeta p-5 text-sm">
        <h2 id="titulo-entrega" className="font-semibold tracking-tight text-texto">
          {p.retiroEnSucursal ? 'Recoger en sucursal' : 'Dirección de entrega'}
        </h2>
        <p className="mt-2 text-texto-suave">{p.direccion.entrega}</p>
        <p className="mt-1 text-texto-suave">
          {p.metodoEnvio.nombre} · {p.metodoEnvio.diasEstimados} día(s) estimados
        </p>
      </section>

      <section aria-labelledby="titulo-pago-pedido" className="tarjeta p-5 text-sm">
        <h2 id="titulo-pago-pedido" className="font-semibold tracking-tight text-texto">
          Pago
        </h2>
        <p className="mt-2 text-texto-suave">
          {p.pago.metodoPago} · {p.pago.estado}
        </p>
        <p className="text-texto-suave">
          <Money valor={p.pago.monto} /> · {formatearFecha(p.pago.fecha)}
        </p>
        <p className="text-xs text-texto-tenue">Referencia {p.pago.referencia}</p>
      </section>
    </aside>
  );
}
