import { useState } from 'react';
import { Badge, Button, Select } from '../../components/atoms';
import { ConfirmationDialog, Notice, PageHeading, SearchBox } from '../../components/molecules';
import { BranchForm, DataTable, type Columna } from '../../components/organisms';
import {
  useActualizarSucursal,
  useCambiarEstadoSucursal,
  useSucursalesGestion,
  useCrearSucursal,
  useEliminarSucursal,
} from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import { ApiError } from '../../services/http';
import type { DatosSucursal, SucursalGestion } from '../../types/sucursales';
import { avisoExito, errorNotice, type Aviso } from '../../utils/notice';

const FILTROS = ['q', 'activo'] as const;

type Panel = { modo: 'crear' } | { modo: 'editar'; sucursal: SucursalGestion } | null;
type Confirmacion =
  | { tipo: 'estado'; sucursal: SucursalGestion }
  | { tipo: 'eliminar'; sucursal: SucursalGestion }
  | null;

/** Sucursales de retiro (Administrador): lista con filtros, alta y edición en panel, estado y baja. */
export default function SucursalesPage() {
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'nombre:asc',
    pageSizePorDefecto: 20,
  });
  const { filtros } = tabla;
  const sucursales = useSucursalesGestion(tabla.params);
  const crear = useCrearSucursal();
  const actualizar = useActualizarSucursal();
  const cambiarEstado = useCambiarEstadoSucursal();
  const eliminar = useEliminarSucursal();
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');

  const columnas: Columna<SucursalGestion>[] = [
    {
      clave: 'nombre',
      titulo: 'Nombre',
      orden: 'nombre',
      celda: (c) => (
        <>
          <span className="font-medium">{c.nombre}</span>
          <span className="block text-xs text-texto-tenue">{c.linea1}</span>
        </>
      ),
    },
    {
      clave: 'ubicacion',
      titulo: 'Municipio',
      orden: 'municipio',
      celda: (c) => `${c.municipio}, ${c.departamento}`,
    },
    { clave: 'telefono', titulo: 'Teléfono', celda: (c) => c.telefono },
    {
      clave: 'pedidos',
      titulo: 'Pedidos',
      orden: 'cantidadPedidos',
      alinear: 'derecha',
      celda: (c) => c.cantidadPedidos,
    },
    {
      clave: 'estado',
      titulo: 'Estado',
      orden: 'activo',
      celda: (c) => (
        <Badge tono={c.activo ? 'verde' : 'gris'}>{c.activo ? 'Activa' : 'Inactiva'}</Badge>
      ),
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      tituloOculto: true,
      alinear: 'derecha',
      celda: (c) => (
        <span className="inline-flex flex-wrap justify-end gap-2">
          <Button
            variante="secondary"
            className="px-3 py-1.5 text-xs"
            aria-label={`Editar ${c.nombre}`}
            onClick={() => setPanel({ modo: 'editar', sucursal: c })}
          >
            Editar
          </Button>
          <Button
            variante="secondary"
            className="px-3 py-1.5 text-xs"
            aria-label={`${c.activo ? 'Desactivar' : 'Activar'} ${c.nombre}`}
            onClick={() => setConfirmacion({ tipo: 'estado', sucursal: c })}
          >
            {c.activo ? 'Desactivar' : 'Activar'}
          </Button>
          <Button
            variante="secondary"
            className="px-3 py-1.5 text-xs"
            aria-label={`Eliminar ${c.nombre}`}
            onClick={() => setConfirmacion({ tipo: 'eliminar', sucursal: c })}
          >
            Eliminar
          </Button>
        </span>
      ),
    },
  ];

  async function guardar(datos: DatosSucursal) {
    if (panel?.modo === 'editar') {
      await actualizar.mutateAsync({ id: panel.sucursal.idSucursal, datos });
      setAviso(avisoExito(`Sucursal "${datos.nombre}" actualizada.`));
    } else {
      await crear.mutateAsync(datos);
      setAviso(avisoExito(`Sucursal "${datos.nombre}" creada.`));
    }
    setPanel(null);
  }

  function confirmar() {
    if (!confirmacion) return;
    const { sucursal } = confirmacion;
    const cerrar = () => setConfirmacion(null);
    if (confirmacion.tipo === 'estado') {
      cambiarEstado.mutate(
        { id: sucursal.idSucursal, activo: !sucursal.activo },
        {
          onSuccess: () =>
            setAviso(
              avisoExito(
                sucursal.activo
                  ? `"${sucursal.nombre}" desactivada: ya no se ofrece para retiro.`
                  : `"${sucursal.nombre}" activada.`,
              ),
            ),
          onError: (error) => setAviso(errorNotice(error, 'No se pudo cambiar el estado.')),
          onSettled: cerrar,
        },
      );
    } else {
      eliminar.mutate(sucursal.idSucursal, {
        onSuccess: () => setAviso(avisoExito(`Sucursal "${sucursal.nombre}" eliminada.`)),
        onError: (error) =>
          setAviso(
            error instanceof ApiError && error.code === 'EN_USO'
              ? {
                  tipo: 'error',
                  mensaje: `No se puede eliminar "${sucursal.nombre}": tiene pedidos asociados. Desactívala en su lugar.`,
                  referencia: error.requestId,
                }
              : errorNotice(error, 'No se pudo eliminar la sucursal.'),
          ),
        onSettled: cerrar,
      });
    }
  }

  const eliminando = confirmacion?.tipo === 'eliminar';

  return (
    <>
      <PageHeading
        titulo="Sucursales"
        descripcion="Puntos de retiro del checkout. Una sucursal inactiva deja de ofrecerse a los clientes."
        accion={
          <Button onClick={() => setPanel({ modo: 'crear' })} disabled={panel?.modo === 'crear'}>
            Nueva sucursal
          </Button>
        }
      />

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      {panel && (
        <section aria-labelledby="titulo-panel-sucursal" className="tarjeta mb-4 p-5">
          <h2 id="titulo-panel-sucursal" className="mb-3 font-semibold tracking-tight text-texto">
            {panel.modo === 'editar' ? `Editar ${panel.sucursal.nombre}` : 'Nueva sucursal'}
          </h2>
          <BranchForm
            key={panel.modo === 'editar' ? panel.sucursal.idSucursal : 'nueva'}
            {...(panel.modo === 'editar' ? { sucursal: panel.sucursal } : {})}
            onGuardar={guardar}
            onCancelar={() => setPanel(null)}
          />
        </section>
      )}

      <div className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-texto-suave">Nombre</p>
          <SearchBox
            className="mt-1"
            etiqueta="Buscar sucursal por nombre"
            valor={filtros.q}
            onBuscar={(q) => tabla.setFiltros({ q })}
          />
        </div>
        <Select
          label="Estado"
          value={filtros.activo}
          onChange={(e) => tabla.setFiltros({ activo: e.target.value })}
        >
          <option value="">Todas</option>
          <option value="true">Activas</option>
          <option value="false">Inactivas</option>
        </Select>
      </div>

      <DataTable
        titulo="Lista de sucursales"
        columnas={columnas}
        consulta={sucursales}
        tabla={tabla}
        idFila={(c) => c.idSucursal}
        vacio={{
          titulo: hayFiltros ? 'No hay sucursales con esos filtros' : 'Aún no hay sucursales',
          descripcion: hayFiltros ? 'Prueba con otros filtros.' : 'Crea la primera sucursal.',
          accion: hayFiltros ? (
            <Button onClick={tabla.limpiarFiltros}>Limpiar filtros</Button>
          ) : undefined,
        }}
      />

      <ConfirmationDialog
        abierto={confirmacion !== null}
        titulo={
          confirmacion?.tipo === 'eliminar'
            ? `¿Eliminar "${confirmacion.sucursal.nombre}"?`
            : confirmacion?.sucursal.activo
              ? `¿Desactivar "${confirmacion.sucursal.nombre}"?`
              : `¿Activar "${confirmacion?.sucursal.nombre ?? ''}"?`
        }
        descripcion={
          eliminando
            ? 'Solo se puede eliminar si no tiene pedidos. No se puede deshacer.'
            : confirmacion?.sucursal.activo
              ? 'Dejará de ofrecerse como punto de retiro en el checkout.'
              : 'Volverá a ofrecerse como punto de retiro en el checkout.'
        }
        textoConfirmar={eliminando ? 'Eliminar' : 'Confirmar'}
        cargando={cambiarEstado.isPending || eliminar.isPending}
        onConfirmar={confirmar}
        onCancelar={() => setConfirmacion(null)}
      />
    </>
  );
}
