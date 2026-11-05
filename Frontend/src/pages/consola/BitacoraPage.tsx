import { Button, Input, Select } from '../../components/atoms';
import { PageHeading } from '../../components/molecules';
import { AuditLogTable } from '../../components/organisms';
import { useBitacora, useModulosBitacora } from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';

const FILTROS = [
  'modulo',
  'entidad',
  'idRegistro',
  'idUsuario',
  'accion',
  'desde',
  'hasta',
] as const;

/** Bitácora de auditoría (solo lectura): filtros, orden y página en la URL. */
export default function BitacoraPage() {
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'fecha:desc',
    pageSizePorDefecto: 20,
  });
  const { filtros } = tabla;
  const modulos = useModulosBitacora();
  const rangoInvalido =
    filtros.desde !== '' && filtros.hasta !== '' && filtros.desde > filtros.hasta;
  // Con un rango invertido la API respondería 400: no se consulta hasta corregirlo.
  const bitacora = useBitacora(
    rangoInvalido ? { ...tabla.params, desde: undefined, hasta: undefined } : tabla.params,
  );
  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');

  return (
    <>
      <PageHeading
        titulo="Bitácora"
        descripcion="Registro inmutable de los cambios. Los filtros de texto son por igualdad."
      />
      <div className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Módulo"
          value={filtros.modulo}
          onChange={(e) => tabla.setFiltros({ modulo: e.target.value })}
        >
          <option value="">Todos</option>
          {modulos.data?.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Input
          label="Entidad"
          value={filtros.entidad}
          maxLength={50}
          onChange={(e) => tabla.setFiltros({ entidad: e.target.value })}
        />
        <Input
          label="ID del registro"
          type="number"
          min={1}
          inputMode="numeric"
          value={filtros.idRegistro}
          onChange={(e) => tabla.setFiltros({ idRegistro: e.target.value })}
        />
        <Input
          label="ID del usuario"
          type="number"
          min={1}
          inputMode="numeric"
          value={filtros.idUsuario}
          onChange={(e) => tabla.setFiltros({ idUsuario: e.target.value })}
        />
        <Input
          label="Acción"
          value={filtros.accion}
          maxLength={20}
          onChange={(e) => tabla.setFiltros({ accion: e.target.value })}
        />
        <Input
          label="Desde"
          type="date"
          value={filtros.desde}
          onChange={(e) => tabla.setFiltros({ desde: e.target.value })}
        />
        <Input
          label="Hasta"
          type="date"
          value={filtros.hasta}
          error={rangoInvalido ? 'Debe ser igual o posterior a la fecha inicial.' : undefined}
          onChange={(e) => tabla.setFiltros({ hasta: e.target.value })}
        />
        {hayFiltros && (
          <div className="flex items-end">
            <Button variante="ghost" onClick={tabla.limpiarFiltros}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>
      <AuditLogTable
        consulta={bitacora}
        tabla={tabla}
        vacio={{
          titulo: hayFiltros ? 'No hay registros con esos filtros' : 'La bitácora está vacía',
          descripcion: hayFiltros ? 'Prueba con otros filtros.' : undefined,
          accion: hayFiltros ? (
            <Button onClick={tabla.limpiarFiltros}>Limpiar filtros</Button>
          ) : undefined,
        }}
      />
    </>
  );
}
