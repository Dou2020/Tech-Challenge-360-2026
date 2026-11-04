import type { DevolucionPedido } from '../../types/pedidos';
import { formatearFecha } from '../../utils/format';
import { Money } from '../atoms/Money';

/** Devoluciones registradas de un pedido; no muestra nada si no hay. */
export function ReturnsList({ devoluciones }: { devoluciones: DevolucionPedido[] }) {
  if (devoluciones.length === 0) return null;
  return (
    <section aria-labelledby="titulo-devoluciones" className="tarjeta p-5">
      <h2 id="titulo-devoluciones" className="mb-3 font-semibold tracking-tight text-texto">
        Devoluciones
      </h2>
      <ul className="space-y-3 text-sm">
        {devoluciones.map((d) => (
          <li key={d.idDevolucion} className="rounded-lg bg-superficie-suave p-3">
            <p className="font-medium">
              {d.tipo === 'TOTAL' ? 'Devolución total' : 'Devolución parcial'} ·{' '}
              <Money valor={d.montoReembolso} />
            </p>
            <p className="text-texto-suave">
              {formatearFecha(d.fecha)} · {d.motivo}
            </p>
            <ul className="mt-1 list-disc pl-5 text-texto-suave">
              {d.lineas.map((l) => (
                <li key={l.idPedidoDetalle}>
                  {l.cantidad} × {l.nombreProducto} ({l.sku})
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
