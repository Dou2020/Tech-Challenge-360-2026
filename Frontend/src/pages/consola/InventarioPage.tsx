import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Select } from '../../components/atoms';
import { Dialog, Notice, PageHeading, SearchBox } from '../../components/molecules';
import { DataTable, StockAdjustmentForm, type Columna } from '../../components/organisms';
import { useCategorias, useExistencias, useRegistrarMovimiento } from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import type { Existencia } from '../../types/inventario';
import { estadoExistencia } from '../../utils/inventario';
import { avisoExito, type Aviso } from '../../utils/notice';

const FILTROS = ['q', 'idCategoria', 'bajoStock', 'activo'] as const;

/** Existencias por variante (Operador y Administrador) con registro de entradas y ajustes. */
export default function InventarioPage() {
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'existenciaDisponible:asc',
    pageSizePorDefecto: 20,
  });
  const { filtros } = tabla;
  const existencias = useExistencias(tabla.params);
  const categorias = useCategorias();
  const registrar = useRegistrarMovimiento();
  const [seleccionada, setSeleccionada] = useState<Existencia | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');
  // El umbral es el mismo en todas las filas (Configuracion.UmbralBajoStock).
  const umbral = existencias.data?.items[0]?.umbralBajoStock;

  const columnas: Columna<Existencia>[] = [
    {
      clave: 'sku',
      titulo: 'SKU',
      orden: 'sku',
      celda: (e) => <span className="font-mono text-xs">{e.sku}</span>,
    },
    {
      clave: 'producto',
      titulo: 'Producto',
      orden: 'producto',
      celda: (e) => {
        const inactivos = [
          !e.activo && 'Variante inactiva',
          !e.productoActivo && 'Producto inactivo',
          !e.categoriaActiva && 'Categoría inactiva',
        ].filter((t): t is string => t !== false);
        return (
          <>
            <span className="block">{e.producto}</span>
            {e.descripcion && (
              <span className="block text-xs text-texto-tenue">{e.descripcion}</span>
            )}
            {inactivos.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {inactivos.map((t) => (
                  <Badge key={t} tono="gris">
                    {t}
                  </Badge>
                ))}
              </span>
            )}
          </>
        );
      },
    },
    { clave: 'categoria', titulo: 'Categoría', orden: 'categoria', celda: (e) => e.categoria },
    {
      clave: 'fisica',
      titulo: 'Física',
      orden: 'existenciaFisica',
      alinear: 'derecha',
      celda: (e) => e.existenciaFisica,
    },
    {
      clave: 'reservada',
      titulo: 'Reservada',
      orden: 'existenciaReservada',
      alinear: 'derecha',
      celda: (e) => e.existenciaReservada,
    },
    {
      clave: 'disponible',
      titulo: 'Disponible',
      orden: 'existenciaDisponible',
      alinear: 'derecha',
      celda: (e) => {
        const estado = estadoExistencia(e);
        return (
          <span className="inline-flex items-center justify-end gap-2">
            {estado && <Badge tono={estado.tono}>{estado.etiqueta}</Badge>}
            <span className="font-medium">{e.existenciaDisponible}</span>
          </span>
        );
      },
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      tituloOculto: true,
      alinear: 'derecha',
      celda: (e) => (
        <span className="inline-flex gap-2">
          <Link
            to={`/consola/inventario/${e.idVariante}/kardex`}
            state={{ sku: e.sku, producto: e.producto, descripcion: e.descripcion }}
            aria-label={`Ver kardex de ${e.sku}`}
            className="rounded-lg border border-borde-fuerte px-3 py-1.5 text-xs font-medium text-texto hover:bg-superficie-suave"
          >
            Kardex
          </Link>
          <Button
            variante="secondary"
            className="px-3 py-1.5 text-xs"
            aria-label={`Registrar movimiento de ${e.sku}`}
            onClick={() => setSeleccionada(e)}
          >
            Registrar movimiento
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeading
        titulo="Inventario"
        descripcion={`Existencia física, reservada y disponible de cada variante.${
          umbral === undefined ? '' : ` Bajo stock: disponible ≤ ${umbral}.`
        }`}
      />

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      <div className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <p className="text-sm font-medium text-texto-suave">SKU o producto</p>
          <SearchBox
            className="mt-1"
            etiqueta="Buscar por SKU o producto"
            placeholder="CAM-…"
            valor={filtros.q}
            onBuscar={(q) => tabla.setFiltros({ q })}
          />
        </div>
        <Select
          label="Categoría"
          value={filtros.idCategoria}
          onChange={(e) => tabla.setFiltros({ idCategoria: e.target.value })}
        >
          <option value="">Todas</option>
          {categorias.data?.map((c) => (
            <option key={c.idCategoria} value={c.idCategoria}>
              {c.nombre}
            </option>
          ))}
        </Select>
        <Select
          label="Existencia"
          value={filtros.bajoStock}
          onChange={(e) => tabla.setFiltros({ bajoStock: e.target.value })}
        >
          <option value="">Toda</option>
          <option value="true">
            {umbral === undefined ? 'Solo bajo stock' : `Solo bajo stock (≤ ${umbral})`}
          </option>
          <option value="false">Sin bajo stock</option>
        </Select>
        <Select
          label="Variante"
          value={filtros.activo}
          onChange={(e) => tabla.setFiltros({ activo: e.target.value })}
        >
          <option value="">Todas</option>
          <option value="true">Activas</option>
          <option value="false">Inactivas</option>
        </Select>
        {hayFiltros && (
          <div className="flex items-end">
            <Button variante="ghost" onClick={tabla.limpiarFiltros}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      <Dialog
        abierto={seleccionada !== null}
        titulo="Registrar movimiento"
        ancho="lg"
        onCerrar={() => setSeleccionada(null)}
      >
        {seleccionada && (
          <StockAdjustmentForm
            variante={seleccionada}
            onCancelar={() => setSeleccionada(null)}
            onEnviar={async (datos) => {
              const resultado = await registrar.mutateAsync(
                datos.clase === 'ENTRADA_COMPRA'
                  ? {
                      clase: 'ENTRADA_COMPRA',
                      idVariante: seleccionada.idVariante,
                      cantidad: datos.cantidad,
                      motivo: datos.motivo,
                    }
                  : {
                      clase: 'AJUSTE',
                      idVariante: seleccionada.idVariante,
                      tipo: datos.clase === 'AJUSTE_ENTRADA' ? 'ENTRADA' : 'SALIDA',
                      cantidad: datos.cantidad,
                      motivo: datos.motivo,
                    },
              );
              setAviso(
                avisoExito(
                  `Movimiento registrado en ${resultado.sku}: física ${resultado.existenciaFisica}, disponible ${resultado.existenciaDisponible}.`,
                ),
              );
              // Si mientras tanto se abrió otra variante, su diálogo queda abierto.
              setSeleccionada((actual) =>
                actual?.idVariante === seleccionada.idVariante ? null : actual,
              );
            }}
          />
        )}
      </Dialog>

      <DataTable
        titulo="Existencias por variante"
        columnas={columnas}
        consulta={existencias}
        tabla={tabla}
        idFila={(e) => e.idVariante}
        vacio={{
          titulo: hayFiltros ? 'No hay variantes con esos filtros' : 'Sin variantes',
          descripcion: hayFiltros ? 'Prueba con otros filtros.' : undefined,
          accion: hayFiltros ? (
            <Button onClick={tabla.limpiarFiltros}>Limpiar filtros</Button>
          ) : undefined,
        }}
      />
    </>
  );
}
