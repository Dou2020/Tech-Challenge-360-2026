import sql from 'mssql';
import { executeSp, type ParametroSp, type ResultadoSp } from '../../db/executeSp.js';
import { parametrosPaginacion, type Paginacion } from '../../shared/utils/paginacion.js';
import type {
  DatosSucursal,
  FilaSucursal,
  FilaSucursalPublica,
  FiltrosSucursales,
} from './sucursales.types.js';

/*
 * Los SP de escritura reciben @IDUsuarioSolicitante (del JWT) y no verifican el rol: las rutas
 * exigen Administrador. Pueden lanzar 50004 (solicitante inexistente) y 50012 (desactivado).
 */

const solicitante = (idUsuario: number): ParametroSp => ({
  nombre: 'IDUsuarioSolicitante',
  tipo: sql.Int,
  valor: idUsuario,
});

const idSucursal = (valor: number): ParametroSp => ({
  nombre: 'IDSucursal',
  tipo: sql.Int,
  valor,
});

/** Parámetros de texto compartidos por SP_Sucursales_Crear y _Actualizar. */
function parametrosDatos(datos: DatosSucursal): ParametroSp[] {
  return [
    { nombre: 'Nombre', tipo: sql.NVarChar(100), valor: datos.nombre },
    { nombre: 'Telefono', tipo: sql.NVarChar(20), valor: datos.telefono },
    { nombre: 'Linea1', tipo: sql.NVarChar(200), valor: datos.linea1 },
    { nombre: 'Linea2', tipo: sql.NVarChar(200), valor: datos.linea2 },
    { nombre: 'Municipio', tipo: sql.NVarChar(100), valor: datos.municipio },
    { nombre: 'Departamento', tipo: sql.NVarChar(100), valor: datos.departamento },
    { nombre: 'CodigoPostal', tipo: sql.NVarChar(10), valor: datos.codigoPostal },
    { nombre: 'Horario', tipo: sql.NVarChar(200), valor: datos.horario },
  ];
}

function primeraFila(resultado: ResultadoSp<FilaSucursal>, sp: string): FilaSucursal {
  const fila = resultado.filas[0];
  if (!fila) throw new Error(`${sp} no devolvió filas`);
  return fila;
}

export const sucursalesRepository = {
  /** Públicas: solo activas, por nombre. */
  async listarPublicas(): Promise<FilaSucursalPublica[]> {
    const { filas } = await executeSp<FilaSucursalPublica>('SP_Catalogo_ListarSucursales');
    return filas;
  },

  listar(
    idUsuario: number,
    filtros: FiltrosSucursales,
    paginacion: Paginacion,
  ): Promise<ResultadoSp<FilaSucursal>> {
    return executeSp<FilaSucursal>('SP_Sucursales_Listar', [
      solicitante(idUsuario),
      { nombre: 'Q', tipo: sql.NVarChar(100), valor: filtros.q ?? null },
      { nombre: 'Activo', tipo: sql.Bit, valor: filtros.activo ?? null },
      ...parametrosPaginacion(paginacion),
    ]);
  },

  /** Este SP no recibe solicitante. 50004 si no existe. */
  async obtener(id: number): Promise<FilaSucursal> {
    const resultado = await executeSp<FilaSucursal>('SP_Sucursales_ObtenerPorId', [idSucursal(id)]);
    return primeraFila(resultado, 'SP_Sucursales_ObtenerPorId');
  },

  /** Nombre repetido: 2627 → DUPLICADO. */
  async crear(idUsuario: number, datos: DatosSucursal): Promise<FilaSucursal> {
    const resultado = await executeSp<FilaSucursal>('SP_Sucursales_Crear', [
      solicitante(idUsuario),
      ...parametrosDatos(datos),
    ]);
    return primeraFila(resultado, 'SP_Sucursales_Crear');
  },

  async actualizar(idUsuario: number, id: number, datos: DatosSucursal): Promise<FilaSucursal> {
    const resultado = await executeSp<FilaSucursal>('SP_Sucursales_Actualizar', [
      solicitante(idUsuario),
      idSucursal(id),
      ...parametrosDatos(datos),
    ]);
    return primeraFila(resultado, 'SP_Sucursales_Actualizar');
  },

  async cambiarEstado(idUsuario: number, id: number, activo: boolean): Promise<FilaSucursal> {
    const resultado = await executeSp<FilaSucursal>('SP_Sucursales_CambiarEstado', [
      solicitante(idUsuario),
      idSucursal(id),
      { nombre: 'Activo', tipo: sql.Bit, valor: activo },
    ]);
    return primeraFila(resultado, 'SP_Sucursales_CambiarEstado');
  },

  /** 50051 EN_USO si tiene pedidos. */
  async eliminar(idUsuario: number, id: number): Promise<void> {
    await executeSp('SP_Sucursales_Eliminar', [solicitante(idUsuario), idSucursal(id)]);
  },
};
