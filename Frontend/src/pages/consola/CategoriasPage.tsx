import { useState } from 'react';
import { Badge, Button, Select } from '../../components/atoms';
import { ConfirmationDialog, Notice, PageHeading, SearchBox } from '../../components/molecules';
import { CategoryForm, DataTable, type Columna } from '../../components/organisms';
import {
  useActualizarCategoria,
  useCambiarEstadoCategoria,
  useCategoriasGestion,
  useCrearCategoria,
  useEliminarCategoria,
} from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import { ApiError } from '../../services/http';
import type { CategoriaGestion } from '../../types/gestion';
import { avisoExito, errorNotice, type Aviso } from '../../utils/notice';

const FILTROS = ['q', 'activo'] as const;

type Panel = { modo: 'crear' } | { modo: 'editar'; categoria: CategoriaGestion } | null;
type Confirmacion =
  | { tipo: 'estado'; categoria: CategoriaGestion }
  | { tipo: 'eliminar'; categoria: CategoriaGestion }
  | null;

/** Categorías del catálogo (Administrador): lista con filtros, alta y edición en panel, estado y baja. */
export default function CategoriasPage() {
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'nombre:asc',
    pageSizePorDefecto: 20,
  });
  const { filtros } = tabla;
  const categorias = useCategoriasGestion(tabla.params);
  const crear = useCrearCategoria();
  const actualizar = useActualizarCategoria();
  const cambiarEstado = useCambiarEstadoCategoria();
  const eliminar = useEliminarCategoria();
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');

  const columnas: Columna<CategoriaGestion>[] = [
    {
      clave: 'nombre',
      titulo: 'Nombre',
      orden: 'nombre',
      celda: (c) => (
        <>
          <span className="font-medium">{c.nombre}</span>
          {c.descripcion && <span className="block text-xs text-texto-tenue">{c.descripcion}</span>}
        </>
      ),
    },
    {
      clave: 'productos',
      titulo: 'Productos',
      orden: 'cantidadProductos',
      alinear: 'derecha',
      celda: (c) => c.cantidadProductos,
    },
    { clave: 'cupones', titulo: 'Cupones', alinear: 'derecha', celda: (c) => c.cantidadCupones },
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
            onClick={() => setPanel({ modo: 'editar', categoria: c })}
          >
            Editar
          </Button>
          <Button
            variante="secondary"
            className="px-3 py-1.5 text-xs"
            aria-label={`${c.activo ? 'Desactivar' : 'Activar'} ${c.nombre}`}
            onClick={() => setConfirmacion({ tipo: 'estado', categoria: c })}
          >
            {c.activo ? 'Desactivar' : 'Activar'}
          </Button>
          <Button
            variante="secondary"
            className="px-3 py-1.5 text-xs"
            aria-label={`Eliminar ${c.nombre}`}
            onClick={() => setConfirmacion({ tipo: 'eliminar', categoria: c })}
          >
            Eliminar
          </Button>
        </span>
      ),
    },
  ];

  async function guardar(datos: { nombre: string; descripcion?: string }) {
    if (panel?.modo === 'editar') {
      await actualizar.mutateAsync({ id: panel.categoria.idCategoria, datos });
      setAviso(avisoExito(`Categoría "${datos.nombre}" actualizada.`));
    } else {
      await crear.mutateAsync(datos);
      setAviso(avisoExito(`Categoría "${datos.nombre}" creada.`));
    }
    setPanel(null);
  }

  function confirmar() {
    if (!confirmacion) return;
    const { categoria } = confirmacion;
    const cerrar = () => setConfirmacion(null);
    if (confirmacion.tipo === 'estado') {
      cambiarEstado.mutate(
        { id: categoria.idCategoria, activo: !categoria.activo },
        {
          onSuccess: () =>
            setAviso(
              avisoExito(
                categoria.activo
                  ? `"${categoria.nombre}" desactivada: sus productos se ocultan de la tienda.`
                  : `"${categoria.nombre}" activada.`,
              ),
            ),
          onError: (error) => setAviso(errorNotice(error, 'No se pudo cambiar el estado.')),
          onSettled: cerrar,
        },
      );
    } else {
      eliminar.mutate(categoria.idCategoria, {
        onSuccess: () => setAviso(avisoExito(`Categoría "${categoria.nombre}" eliminada.`)),
        onError: (error) =>
          setAviso(
            error instanceof ApiError && error.code === 'EN_USO'
              ? {
                  tipo: 'error',
                  mensaje: `No se puede eliminar "${categoria.nombre}": tiene productos o cupones. Desactívala en su lugar.`,
                  referencia: error.requestId,
                }
              : errorNotice(error, 'No se pudo eliminar la categoría.'),
          ),
        onSettled: cerrar,
      });
    }
  }

  const eliminando = confirmacion?.tipo === 'eliminar';

  return (
    <>
      <PageHeading
        titulo="Categorías"
        descripcion="Agrupan los productos de la tienda. Una categoría inactiva oculta sus productos."
        accion={
          <Button onClick={() => setPanel({ modo: 'crear' })} disabled={panel?.modo === 'crear'}>
            Nueva categoría
          </Button>
        }
      />

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      {panel && (
        <section aria-labelledby="titulo-panel-categoria" className="tarjeta mb-4 p-5">
          <h2 id="titulo-panel-categoria" className="mb-3 font-semibold tracking-tight text-texto">
            {panel.modo === 'editar' ? `Editar ${panel.categoria.nombre}` : 'Nueva categoría'}
          </h2>
          <CategoryForm
            key={panel.modo === 'editar' ? panel.categoria.idCategoria : 'nueva'}
            {...(panel.modo === 'editar' ? { categoria: panel.categoria } : {})}
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
            etiqueta="Buscar categoría por nombre"
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
        titulo="Lista de categorías"
        columnas={columnas}
        consulta={categorias}
        tabla={tabla}
        idFila={(c) => c.idCategoria}
        vacio={{
          titulo: hayFiltros ? 'No hay categorías con esos filtros' : 'Aún no hay categorías',
          descripcion: hayFiltros ? 'Prueba con otros filtros.' : 'Crea la primera categoría.',
          accion: hayFiltros ? (
            <Button onClick={tabla.limpiarFiltros}>Limpiar filtros</Button>
          ) : undefined,
        }}
      />

      <ConfirmationDialog
        abierto={confirmacion !== null}
        titulo={
          confirmacion?.tipo === 'eliminar'
            ? `¿Eliminar "${confirmacion.categoria.nombre}"?`
            : confirmacion?.categoria.activo
              ? `¿Desactivar "${confirmacion.categoria.nombre}"?`
              : `¿Activar "${confirmacion?.categoria.nombre ?? ''}"?`
        }
        descripcion={
          eliminando
            ? 'Solo se puede eliminar si no tiene productos ni cupones. No se puede deshacer.'
            : confirmacion?.categoria.activo
              ? 'Sus productos dejarán de verse en la tienda.'
              : 'Sus productos activos volverán a verse en la tienda.'
        }
        textoConfirmar={eliminando ? 'Eliminar' : 'Confirmar'}
        cargando={cambiarEstado.isPending || eliminar.isPending}
        onConfirmar={confirmar}
        onCancelar={() => setConfirmacion(null)}
      />
    </>
  );
}
