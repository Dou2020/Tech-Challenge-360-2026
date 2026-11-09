import { useState } from 'react';
import {
  useCrearDireccion,
  useDirecciones,
  useMetodosEnvio,
  useSucursalesPublicas,
} from '../../hooks/queries';
import type { EntregaCheckout } from '../../types/checkout';
import { Button } from '../atoms/Button';
import { Skeleton } from '../atoms/Skeleton';
import { ErrorState } from '../molecules/ErrorState';
import { Money } from '../atoms/Money';
import { AddressForm } from './AddressForm';

interface Props {
  idDireccionInicial: number | null;
  idMetodoEnvioInicial: number | null;
  idSucursalInicial?: number | null;
  iniciando: boolean;
  onContinuar: (entrega: EntregaCheckout) => void;
}

/**
 * Paso 1 del checkout: método de envío y, según este, la dirección de entrega (domicilio)
 * o la sucursal de retiro.
 */
export function CheckoutSelection({
  idDireccionInicial,
  idMetodoEnvioInicial,
  idSucursalInicial = null,
  iniciando,
  onContinuar,
}: Props) {
  const direcciones = useDirecciones();
  const metodos = useMetodosEnvio();
  const sucursales = useSucursalesPublicas();
  const crear = useCrearDireccion();
  const [idDireccion, setIdDireccion] = useState<number | null>(idDireccionInicial);
  const [idMetodo, setIdMetodo] = useState<number | null>(idMetodoEnvioInicial);
  const [idSucursal, setIdSucursal] = useState<number | null>(idSucursalInicial);
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
  const metodo = metodos.data.find((m) => m.idMetodoEnvio === idMetodo);
  const esRetiro = metodo?.requiereSucursal === true;
  // Mientras carga o falla la lista no se sabe si hay sucursales: no se deshabilita el retiro.
  const sinSucursales = sucursales.isSuccess && sucursales.data.length === 0;
  const puedeContinuar =
    idMetodo !== null && (esRetiro ? idSucursal !== null : idDireccion !== null);

  function continuar() {
    if (idMetodo === null) return;
    if (esRetiro) {
      if (idSucursal !== null) onContinuar({ idMetodoEnvio: idMetodo, idSucursal });
    } else if (idDireccion !== null) {
      onContinuar({ idMetodoEnvio: idMetodo, idDireccion });
    }
  }
  const mostrarFormulario = creando || lista.length === 0;
  const opcion =
    'flex cursor-pointer items-start gap-3 rounded-xl border border-borde bg-superficie p-4 text-sm transition-colors hover:border-borde-fuerte has-[:checked]:border-primario has-[:checked]:bg-acento-suave has-[:checked]:ring-1 has-[:checked]:ring-primario';

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold tracking-tight text-texto">Método de envío</legend>
        {metodos.data.map((m) => {
          const deshabilitado = m.requiereSucursal && sinSucursales;
          return (
            <label
              key={m.idMetodoEnvio}
              className={`${opcion} ${deshabilitado ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name="metodo-envio"
                checked={idMetodo === m.idMetodoEnvio}
                disabled={deshabilitado}
                onChange={() => setIdMetodo(m.idMetodoEnvio)}
                className="mt-1"
              />
              <span className="flex flex-1 justify-between gap-4">
                <span>
                  <strong>{m.nombre}</strong>
                  <br />
                  <span className="text-texto-suave">{m.diasEstimados} día(s) estimados</span>
                  {deshabilitado && (
                    <span className="mt-1 block text-aviso-texto">
                      No hay sucursales disponibles por ahora.
                    </span>
                  )}
                </span>
                <Money valor={m.costo} />
              </span>
            </label>
          );
        })}
      </fieldset>

      {esRetiro && (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-semibold tracking-tight text-texto">
            Sucursal de retiro
          </legend>
          {sucursales.isPending && (
            <div role="status" aria-label="Cargando sucursales" className="space-y-3">
              <Skeleton className="h-20 w-full" />
            </div>
          )}
          {sucursales.isError && (
            <ErrorState error={sucursales.error} onReintentar={() => void sucursales.refetch()} />
          )}
          {sucursales.isSuccess &&
            sucursales.data.map((su) => (
              <label key={su.idSucursal} className={opcion}>
                <input
                  type="radio"
                  name="sucursal"
                  checked={idSucursal === su.idSucursal}
                  onChange={() => setIdSucursal(su.idSucursal)}
                  className="mt-1"
                />
                <span>
                  <strong>{su.nombre}</strong>
                  <br />
                  <span className="text-texto-suave">
                    {su.linea1}, {su.municipio}, {su.departamento}
                  </span>
                  {su.horario && (
                    <>
                      <br />
                      <span className="text-texto-suave">Horario: {su.horario}</span>
                    </>
                  )}
                  <br />
                  <span className="text-texto-suave">Tel. {su.telefono}</span>
                </span>
              </label>
            ))}
        </fieldset>
      )}

      {!esRetiro && (
        <>
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
        </>
      )}

      <Button
        className="w-full sm:w-auto"
        disabled={!puedeContinuar}
        cargando={iniciando}
        onClick={continuar}
      >
        Continuar al pago
      </Button>
    </div>
  );
}
