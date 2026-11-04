import { useState } from 'react';
import { useCrearDireccion, useDirecciones, useMetodosEnvio } from '../../hooks/queries';
import { Button } from '../atoms/Button';
import { Skeleton } from '../atoms/Skeleton';
import { ErrorState } from '../molecules/ErrorState';
import { Money } from '../atoms/Money';
import { AddressForm } from './AddressForm';

interface Props {
  idDireccionInicial: number | null;
  idMetodoEnvioInicial: number | null;
  iniciando: boolean;
  onContinuar: (idDireccion: number, idMetodoEnvio: number) => void;
}

/** Paso 1 del checkout: dirección de entrega y método de envío. */
export function CheckoutSelection({
  idDireccionInicial,
  idMetodoEnvioInicial,
  iniciando,
  onContinuar,
}: Props) {
  const direcciones = useDirecciones();
  const metodos = useMetodosEnvio();
  const crear = useCrearDireccion();
  const [idDireccion, setIdDireccion] = useState<number | null>(idDireccionInicial);
  const [idMetodo, setIdMetodo] = useState<number | null>(idMetodoEnvioInicial);
  const [creando, setCreando] = useState(false);

  if (direcciones.isPending || metodos.isPending) {
    return (
      <div role="status" aria-label="Cargando opciones de entrega" className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (direcciones.isError || metodos.isError) {
    return (
      <ErrorState
        error={direcciones.error ?? metodos.error}
        onReintentar={() => {
          void direcciones.refetch();
          void metodos.refetch();
        }}
      />
    );
  }

  const lista = direcciones.data;
  const mostrarFormulario = creando || lista.length === 0;
  const opcion =
    'flex cursor-pointer items-start gap-3 rounded-xl border border-borde bg-superficie p-4 text-sm transition-colors hover:border-borde-fuerte has-[:checked]:border-primario has-[:checked]:bg-acento-suave has-[:checked]:ring-1 has-[:checked]:ring-primario';

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold tracking-tight text-texto">
          Dirección de entrega
        </legend>
        {lista.map((d) => (
          <label key={d.idDireccion} className={opcion}>
            <input
              type="radio"
              name="direccion"
              checked={idDireccion === d.idDireccion}
              onChange={() => setIdDireccion(d.idDireccion)}
              className="mt-1"
            />
            <span>
              <strong>{d.alias}</strong> · {d.nombreDestinatario}
              <br />
              <span className="text-texto-suave">
                {d.linea1}, {d.municipio}, {d.departamento}
              </span>
            </span>
          </label>
        ))}
        {!mostrarFormulario && (
          <Button variante="ghost" onClick={() => setCreando(true)}>
            Usar otra dirección
          </Button>
        )}
      </fieldset>

      {mostrarFormulario && (
        <section aria-label="Nueva dirección" className="tarjeta p-5">
          <h3 className="mb-4 font-medium text-texto">
            {lista.length === 0 ? 'Agrega una dirección de entrega' : 'Nueva dirección'}
          </h3>
          <AddressForm
            textoGuardar="Guardar y usar esta dirección"
            onGuardar={async (datos) => {
              const nueva = await crear.mutateAsync(datos);
              setIdDireccion(nueva.idDireccion);
              setCreando(false);
            }}
            {...(lista.length > 0 ? { onCancelar: () => setCreando(false) } : {})}
          />
        </section>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold tracking-tight text-texto">Método de envío</legend>
        {metodos.data.map((m) => (
          <label key={m.idMetodoEnvio} className={opcion}>
            <input
              type="radio"
              name="metodo-envio"
              checked={idMetodo === m.idMetodoEnvio}
              onChange={() => setIdMetodo(m.idMetodoEnvio)}
              className="mt-1"
            />
            <span className="flex flex-1 justify-between gap-4">
              <span>
                <strong>{m.nombre}</strong>
                <br />
                <span className="text-texto-suave">{m.diasEstimados} día(s) estimados</span>
              </span>
              <Money valor={m.costo} />
            </span>
          </label>
        ))}
      </fieldset>

      <Button
        className="w-full sm:w-auto"
        disabled={idDireccion === null || idMetodo === null}
        cargando={iniciando}
        onClick={() =>
          idDireccion !== null && idMetodo !== null && onContinuar(idDireccion, idMetodo)
        }
      >
        Continuar al pago
      </Button>
    </div>
  );
}
