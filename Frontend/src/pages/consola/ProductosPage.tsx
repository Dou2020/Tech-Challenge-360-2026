import { Link } from 'react-router';
import { Badge, Button, Money, Select } from '../../components/atoms';
import { PageHeading, SearchBox } from '../../components/molecules';
import { DataTable, type Columna } from '../../components/organisms';
import { useProductosGestion, useTodasLasCategorias } from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import type { ProductoListado } from '../../types/gestion';

const FILTROS = ['q', 'idCategoria', 'activo'] as const;

const columnas: Columna<ProductoListado>[] = [
  {
    clave: 'imagen',
    titulo: 'Imagen',
    tituloOculto: true,
    celda: (p) =>
      p.imagenPrincipal ? (
        <img
          src={p.imagenPrincipal}
          alt={`Imagen de ${p.nombre}`}
          className="size-10 rounded-md object-cover"
        />
      ) : (
        <span className="flex size-10 items-center justify-center rounded-md bg-superficie-suave text-[10px] text-texto-tenue">
          Sin foto
        </span>
      ),
  },
  {
    clave: 'nombre',
    titulo: 'Producto',
    orden: 'nombre',
    celda: (p) => (
      <Link
        to={`/consola/productos/${p.idProducto}`}
        className="font-medium text-acento hover:underline"
      >
        {p.nombre}
      </Link>
    ),
  },
  { clave: 'categoria', titulo: 'Categoría', orden: 'categoria', celda: (p) => p.categoria },
  {
    clave: 'precio',
    titulo: 'Precio',
    orden: 'precio',
    alinear: 'derecha',
    celda: (p) =>
      p.precioMinimo === null || p.precioMaximo === null ? (
        <span className="text-texto-tenue">Sin variantes</span>
      ) : p.precioMinimo === p.precioMaximo ? (
        <Money valor={p.precioMinimo} />
      ) : (
        <>
          <Money valor={p.precioMinimo} /> – <Money valor={p.precioMaximo} />
        </>
      ),
  },
  {
    clave: 'existencia',
    titulo: 'Existencia',
    orden: 'existencia',
    alinear: 'derecha',
    celda: (p) => (
      <span title={`Física ${p.existenciaFisica}, reservada ${p.existenciaReservada}`}>
        {p.existenciaDisponible} disp. / {p.existenciaFisica} fís.
      </span>
    ),
  },
  {
    clave: 'variantes',
    titulo: 'Variantes',
    alinear: 'derecha',
    celda: (p) => `${p.cantidadVariantesActivas} de ${p.cantidadVariantes}`,
  },
  {
    clave: 'estado',
    titulo: 'Estado',
    celda: (p) => (
      <Badge tono={p.activo ? 'verde' : 'gris'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
    ),
  },
];

/** Productos de gestión (Administrador): incluye inactivos; filtros y orden en la URL. */
export default function ProductosPage() {
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'fechaCreacion:desc',
    pageSizePorDefecto: 20,
  });
  const { filtros } = tabla;
  const productos = useProductosGestion(tabla.params);
  const categorias = useTodasLasCategorias();
  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');

  return (
    <>
      <PageHeading
        titulo="Productos"
        descripcion="Catálogo completo, incluidos los productos inactivos."
        accion={
          <Link
            to="/consola/productos/nuevo"
            className="rounded-lg bg-primario px-4 py-2 text-sm font-medium text-sobre-primario hover:bg-primario-hover"
          >
            Nuevo producto
          </Link>
        }
      />

      <div className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <p className="text-sm font-medium text-texto-suave">Nombre o SKU</p>
          <SearchBox
            className="mt-1"
            etiqueta="Buscar producto por nombre o SKU"
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
              {c.activo ? '' : ' (inactiva)'}
            </option>
          ))}
        </Select>
        <Select
          label="Estado"
          value={filtros.activo}
          onChange={(e) => tabla.setFiltros({ activo: e.target.value })}
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </Select>
        {hayFiltros && (
          <div className="flex items-end">
            <Button variante="ghost" onClick={tabla.limpiarFiltros}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      <DataTable
        titulo="Lista de productos"
        columnas={columnas}
        consulta={productos}
        tabla={tabla}
        idFila={(p) => p.idProducto}
        vacio={{
          titulo: hayFiltros ? 'No hay productos con esos filtros' : 'Aún no hay productos',
          descripcion: hayFiltros ? 'Prueba con otros filtros.' : 'Crea el primer producto.',
          accion: hayFiltros ? (
            <Button onClick={tabla.limpiarFiltros}>Limpiar filtros</Button>
          ) : undefined,
        }}
      />
    </>
  );
}
