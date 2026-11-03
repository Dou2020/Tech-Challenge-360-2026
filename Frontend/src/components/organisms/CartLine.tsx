import { ImageOff, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import type { LineaCarrito } from '../../types/carrito';
import { Badge } from '../atoms/Badge';
import { Money } from '../atoms/Money';
import { QuantityStepper } from '../molecules/QuantityStepper';

interface Props {
  linea: LineaCarrito;
  ocupado?: boolean;
  onCantidad: (idVariante: number, cantidad: number) => void;
  onQuitar: (idVariante: number) => void;
}

/** Línea del carrito. Los importes vienen del backend; aquí solo se muestran. */
export function CartLine({ linea, ocupado = false, onCantidad, onQuitar }: Props) {
  const conProblema = linea.requiereAjuste || linea.excedeDisponible || !linea.vendible;
  const tieneDescuento = Number(linea.descuentoLinea) > 0;

  return (
    <li
      className={`flex gap-4 rounded-2xl bg-superficie p-4 shadow-xs ring-1 ${
        conProblema ? 'ring-aviso' : 'ring-borde'
      }`}
    >
      <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-superficie-suave">
        {linea.imagen ? (
          <img src={linea.imagen} alt={linea.producto} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-texto-tenue">
            <ImageOff className="size-6" aria-hidden />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Link
              to={`/productos/${linea.idProducto}`}
              className="font-medium text-texto hover:text-acento"
            >
              {linea.producto}
            </Link>
            {linea.variante && <p className="text-sm text-texto-suave">{linea.variante}</p>}
            <p className="text-xs text-texto-tenue">
              SKU {linea.sku} · <Money valor={linea.precioUnitario} /> c/u
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold tracking-tight text-texto">
              <Money valor={linea.importeNeto} />
            </p>
            {tieneDescuento && (
              <p className="text-xs text-texto-tenue">
                <s>
                  <Money valor={linea.importe} />
                </s>{' '}
                · Descuento <Money valor={linea.descuentoLinea} />
              </p>
            )}
          </div>
        </div>

        {conProblema && (
          <p
            role="alert"
            className="mt-2 flex flex-wrap items-center gap-2 text-sm text-aviso-texto"
          >
            <Badge tono="ambar">Requiere ajuste</Badge>
            {!linea.vendible
              ? 'Este producto ya no está a la venta. Quítalo para continuar.'
              : linea.existenciaDisponible === 0
                ? 'Sin existencia. Quita la línea para continuar.'
                : `Solo hay ${linea.existenciaDisponible} disponible(s). Baja la cantidad.`}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <QuantityStepper
            etiqueta={`Cantidad de ${linea.producto} ${linea.variante ?? ''}`.trim()}
            valor={linea.cantidad}
            max={linea.vendible ? linea.existenciaDisponible : 0}
            disabled={ocupado}
            onChange={(cantidad) =>
              cantidad !== linea.cantidad && onCantidad(linea.idVariante, cantidad)
            }
          />
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onQuitar(linea.idVariante)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-peligro-texto hover:bg-peligro-suave disabled:opacity-50"
            aria-label={`Quitar ${linea.producto} ${linea.variante ?? ''}`.trim()}
          >
            <Trash2 className="size-4" aria-hidden />
            Quitar
          </button>
        </div>
      </div>
    </li>
  );
}
