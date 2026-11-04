import type { LineaPedido } from '../../types/pedidos';
import { Money } from '../atoms/Money';

/** Líneas de un pedido con precios congelados, tal como los devuelve la API. */
export function OrderLinesTable({ lineas }: { lineas: LineaPedido[] }) {
  return (
    <section aria-labelledby="titulo-lineas" className="tarjeta p-5">
      <h2 id="titulo-lineas" className="font-semibold tracking-tight text-texto">
        Productos
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="text-xs tracking-wide text-texto-tenue uppercase">
            <tr>
              <th scope="col" className="px-3 py-2.5 first:pl-0 last:pr-0">
                Producto
              </th>
              <th scope="col" className="px-3 py-2.5 first:pl-0 last:pr-0 text-right">
                Cant.
              </th>
              <th scope="col" className="px-3 py-2.5 first:pl-0 last:pr-0 text-right">
                Precio
              </th>
              <th scope="col" className="px-3 py-2.5 first:pl-0 last:pr-0 text-right">
                Descuento
              </th>
              <th scope="col" className="px-3 py-2.5 first:pl-0 last:pr-0 text-right">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {lineas.map((l) => (
              <tr key={l.idPedidoDetalle}>
                <td className="px-3 py-2.5 first:pl-0 last:pr-0">
                  {l.nombreProducto}
                  {l.variante && <span className="text-texto-tenue"> · {l.variante}</span>}
                  <div className="text-xs text-texto-tenue">
                    SKU {l.sku}
                    {l.cantidadDevuelta > 0 && ` · devueltas: ${l.cantidadDevuelta}`}
                  </div>
                </td>
                <td className="px-3 py-2.5 first:pl-0 last:pr-0 text-right">{l.cantidad}</td>
                <td className="px-3 py-2.5 first:pl-0 last:pr-0 text-right">
                  <Money valor={l.precioUnitario} />
                </td>
                <td className="px-3 py-2.5 first:pl-0 last:pr-0 text-right">
                  <Money valor={l.descuentoLinea} />
                </td>
                <td className="px-3 py-2.5 first:pl-0 last:pr-0 text-right">
                  <Money valor={l.subtotal} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
