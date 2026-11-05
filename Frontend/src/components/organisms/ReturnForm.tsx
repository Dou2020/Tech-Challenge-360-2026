import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../services/http';
import type { DatosDevolucion, LineaPedido } from '../../types/pedidos';
import { ariaCampo, claseControl } from '../../utils/campos';
import { aplicarErroresApi } from '../../utils/formularios';
import { Button } from '../atoms/Button';
import { InlineAlert } from '../atoms/InlineAlert';
import { Input } from '../atoms/Input';
import { ConfirmationDialog } from '../molecules/ConfirmationDialog';

const MAX_MOTIVO = 300;

interface Formulario {
  motivo: string;
  /** Cantidad por línea, en el mismo orden que las líneas devolvibles. */
  cantidades: string[];
}

interface Props {
  lineas: LineaPedido[];
  /** Envía la devolución; debe rechazar con el error de la API si falla. */
  onEnviar: (datos: DatosDevolucion) => Promise<unknown>;
  onCancelar?: () => void;
}

/** Mensaje claro para los errores de negocio de una devolución. */
function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'CANTIDAD_DEVOLUCION_EXCEDIDA')
      return 'Una de las cantidades supera lo que queda por devolver. Revisa las unidades de cada línea.';
    if (error.code === 'TRANSICION_NO_PERMITIDA')
      return 'El pedido ya no admite devoluciones: su estado cambió. Actualiza la página.';
    return error.message;
  }
  return 'No se pudo registrar la devolución.';
}

/**
 * Devolución por línea: cantidad con tope en `cantidadDevolvible`, motivo obligatorio
 * y al menos una línea con unidades. Pide confirmación antes de enviar.
 */
export function ReturnForm({ lineas, onEnviar, onCancelar }: Props) {
  const devolvibles = lineas.filter((l) => l.cantidadDevolvible > 0);
  const [pendiente, setPendiente] = useState<DatosDevolucion | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const esquema = z
    .object({
      motivo: z
        .string()
        .trim()
        .min(1, 'Indica el motivo.')
        .max(MAX_MOTIVO, 'Máximo 300 caracteres.'),
      cantidades: z.array(z.string()),
    })
    .superRefine((valor, contexto) => {
      valor.cantidades.forEach((texto, i) => {
        const linea = devolvibles[i];
        if (!linea || texto.trim() === '') return;
        const n = Number(texto);
        if (!Number.isInteger(n) || n < 0) {
          contexto.addIssue({
            code: 'custom',
            path: ['cantidades', i],
            message: 'Debe ser un entero.',
          });
        } else if (n > linea.cantidadDevolvible) {
          contexto.addIssue({
            code: 'custom',
            path: ['cantidades', i],
            message: `Máximo ${linea.cantidadDevolvible}.`,
          });
        }
      });
    });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Formulario>({
    resolver: zodResolver(esquema),
    defaultValues: { motivo: '', cantidades: devolvibles.map(() => '') },
  });

  function preparar(valores: Formulario) {
    const lineasEnvio = devolvibles
      .map((l, i) => ({
        idPedidoDetalle: l.idPedidoDetalle,
        cantidad: Number(valores.cantidades[i]),
      }))
      .filter((l) => l.cantidad > 0);
    setErrorEnvio(null);
    if (lineasEnvio.length === 0) {
      setErrorGeneral('Indica la cantidad de al menos una línea.');
      return;
    }
    setErrorGeneral(null);
    setPendiente({ motivo: valores.motivo.trim(), lineas: lineasEnvio });
  }

  async function confirmar() {
    if (!pendiente) return;
    setEnviando(true);
    try {
      await onEnviar(pendiente);
    } catch (error) {
      if (!aplicarErroresApi(error, setError, ['motivo'])) setErrorEnvio(mensajeDeError(error));
    } finally {
      setEnviando(false);
      setPendiente(null);
    }
  }

  if (devolvibles.length === 0) {
    return (
      <p className="text-sm text-texto-suave">
        Todas las unidades de este pedido ya se devolvieron.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(preparar)(e)} noValidate className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-texto-suave">Unidades a devolver</legend>
        {devolvibles.map((l, i) => {
          const id = `devolucion-cantidad-${l.idPedidoDetalle}`;
          const error = errors.cantidades?.[i]?.message;
          return (
            <div key={l.idPedidoDetalle} className="grid items-start gap-2 sm:grid-cols-[1fr_8rem]">
              <label htmlFor={id} className="text-sm text-texto-suave">
                {l.nombreProducto}
                {l.variante && <span className="text-texto-tenue"> · {l.variante}</span>}
                <span className="block text-xs text-texto-tenue">
                  SKU {l.sku} · se pueden devolver hasta {l.cantidadDevolvible}
                </span>
              </label>
              <div>
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={l.cantidadDevolvible}
                  placeholder="0"
                  {...ariaCampo(id, error)}
                  className={claseControl(Boolean(error))}
                  {...register(`cantidades.${i}`)}
                />
                {error && (
                  <p id={`${id}-error`} className="mt-1 text-xs text-peligro-texto">
                    {error}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {errorGeneral && (
          <p role="alert" className="text-xs text-peligro-texto">
            {errorGeneral}
          </p>
        )}
      </fieldset>

      <Input
        label="Motivo de la devolución"
        maxLength={MAX_MOTIVO}
        error={errors.motivo?.message}
        {...register('motivo')}
      />

      {errorEnvio && <InlineAlert>{errorEnvio}</InlineAlert>}

      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button variante="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit">Registrar devolución</Button>
      </div>

      <ConfirmationDialog
        abierto={pendiente !== null}
        titulo="¿Registrar esta devolución?"
        descripcion="Se reintegrará la existencia y se calculará el reembolso. No se puede deshacer."
        textoConfirmar="Registrar devolución"
        cargando={enviando}
        onConfirmar={() => void confirmar()}
        onCancelar={() => setPendiente(null)}
      />
    </form>
  );
}
