import { useState } from 'react';
import {
  useActualizarVariante,
  useAgregarVariante,
  useAtributos,
  useCambiarEstadoVariante,
  useCambiarPrecioVariante,
} from '../../hooks/queries';
import type { ProductoGestion, VarianteGestion } from '../../types/gestion';
import { errorNotice, avisoExito, type Aviso } from '../../utils/notice';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Money } from '../atoms/Money';
import { Skeleton } from '../atoms/Skeleton';
import { ConfirmationDialog } from '../molecules/ConfirmationDialog';
import { ErrorState } from '../molecules/ErrorState';
import { AttributesPanel } from './AttributesPanel';
import type { Columna } from './DataTable';
import { PriceChangeDialog } from './PriceChangeDialog';
import { ReportTable } from './ReportTable';
import { VariantForm } from './VariantForm';

interface Props {
  producto: ProductoGestion;
  /** Avisos de éxito o error para la página que lo contiene. */
  onAviso: (aviso: Aviso) => void;
}

type Edicion = { tipo: 'agregar' } | { tipo: 'editar'; variante: VarianteGestion } | null;

/** Variantes de un producto: agregar, editar SKU y valores, cambiar precio y activar o desactivar. */
export function VariantsManager({ producto, onAviso }: Props) {
  const atributos = useAtributos();
  const agregar = useAgregarVariante(producto.idProducto);
  const actualizar = useActualizarVariante();
  const cambiarPrecio = useCambiarPrecioVariante();
  const cambiarEstado = useCambiarEstadoVariante();
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [precioDe, setPrecioDe] = useState<VarianteGestion | null>(null);
  const [estadoDe, setEstadoDe] = useState<VarianteGestion | null>(null);
  const [gestionando, setGestionando] = useState(false);

  const columnas: Columna<VarianteGestion>[] = [
    {
      clave: 'sku',
      titulo: 'Variante',
      celda: (v) => (
        <>
          <span className="font-mono text-xs">{v.sku}</span>
          {v.descripcion && <span className="block text-xs text-texto-tenue">{v.descripcion}</span>}
        </>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      alinear: 'derecha',
      celda: (v) => <Money valor={v.precio} className="font-medium" />,
    },
    {
      clave: 'existencia',
      titulo: 'Existencia',
      alinear: 'derecha',
      celda: (v) => (
        <span title={`Física ${v.existenciaFisica}, reservada ${v.existenciaReservada}`}>
          {v.existenciaDisponible} disp. / {v.existenciaFisica} fís.
        </span>
      ),
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      celda: (v) => (
        <Badge tono={v.activo ? 'verde' : 'gris'}>{v.activo ? 'Activa' : 'Inactiva'}</Badge>
      ),
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      alinear: 'derecha',
      celda: (v) => (
        <span className="inline-flex flex-wrap justify-end gap-2">
          <Button
            variante="secondary"
            className="px-3 py-1.5 text-xs"
            aria-label={`Editar ${v.sku}`}
            onClick={() => setEdicion({ tipo: 'editar', variante: v })}
          >
            Editar
          </Button>
          <Button
            variante="secondary"
            className="px-3 py-1.5 text-xs"
            aria-label={`Cambiar precio de ${v.sku}`}
            onClick={() => setPrecioDe(v)}
          >
            Cambiar precio
          </Button>
          <Button
            variante="secondary"
            className="px-3 py-1.5 text-xs"
            aria-label={`${v.activo ? 'Desactivar' : 'Activar'} ${v.sku}`}
            onClick={() => setEstadoDe(v)}
          >
            {v.activo ? 'Desactivar' : 'Activar'}
          </Button>
        </span>
      ),
    },
  ];

  function confirmarEstado() {
    if (!estadoDe) return;
    const variante = estadoDe;
    cambiarEstado.mutate(
      { id: variante.idVariante, activo: !variante.activo },
      {
        onSuccess: () =>
          onAviso(
            avisoExito(`Variante ${variante.sku} ${variante.activo ? 'desactivada' : 'activada'}.`),
          ),
        onError: (error) => onAviso(errorNotice(error, 'No se pudo cambiar el estado.')),
        onSettled: () => setEstadoDe(null),
      },
    );
  }

  return (
    <div className="space-y-4">
      <ReportTable
        titulo="Variantes del producto"
        columnas={columnas}
        filas={producto.variantes}
        idFila={(v) => v.idVariante}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variante="secondary"
          disabled={edicion?.tipo === 'agregar'}
          onClick={() => setEdicion({ tipo: 'agregar' })}
        >
          Agregar variante
        </Button>
        <Button variante="ghost" onClick={() => setGestionando((a) => !a)}>
          {gestionando ? 'Ocultar atributos' : 'Gestionar atributos'}
        </Button>
      </div>

      {gestionando && <AttributesPanel />}

      {edicion && (
        <div className="rounded-lg border border-borde p-4">
          <h3 className="mb-3 text-sm font-semibold text-texto">
            {edicion.tipo === 'editar' ? `Editar ${edicion.variante.sku}` : 'Nueva variante'}
          </h3>
          {atributos.isPending && <Skeleton className="h-16 w-full" />}
          {atributos.isError && (
            <ErrorState error={atributos.error} onReintentar={() => void atributos.refetch()} />
          )}
          {atributos.data && (
            <VariantForm
              key={edicion.tipo === 'editar' ? edicion.variante.idVariante : 'nueva'}
              atributos={atributos.data}
              {...(edicion.tipo === 'editar' ? { variante: edicion.variante } : {})}
              onCancelar={() => setEdicion(null)}
              onGuardar={async (datos) => {
                if (edicion.tipo === 'editar') {
                  await actualizar.mutateAsync({
                    id: edicion.variante.idVariante,
                    sku: datos.sku,
                    valores: datos.valores,
                  });
                  onAviso(avisoExito(`Variante ${datos.sku} actualizada.`));
                } else {
                  await agregar.mutateAsync(datos);
                  onAviso(avisoExito(`Variante ${datos.sku} agregada.`));
                }
                setEdicion(null);
              }}
            />
          )}
        </div>
      )}

      {precioDe && (
        <PriceChangeDialog
          key={precioDe.idVariante}
          variante={precioDe}
          onCancelar={() => setPrecioDe(null)}
          onConfirmar={async (precio) => {
            await cambiarPrecio.mutateAsync({ id: precioDe.idVariante, precio });
            onAviso(avisoExito(`Precio de ${precioDe.sku} actualizado.`));
            setPrecioDe(null);
          }}
        />
      )}

      <ConfirmationDialog
        abierto={estadoDe !== null}
        titulo={`¿${estadoDe?.activo ? 'Desactivar' : 'Activar'} ${estadoDe?.sku ?? ''}?`}
        descripcion={
          estadoDe?.activo
            ? 'Una variante inactiva no se muestra ni se vende.'
            : 'La variante volverá a mostrarse y venderse.'
        }
        cargando={cambiarEstado.isPending}
        onConfirmar={confirmarEstado}
        onCancelar={() => setEstadoDe(null)}
      />
    </div>
  );
}
