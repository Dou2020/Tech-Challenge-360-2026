import sql from 'mssql';
import { executeSp, type ParametroSp, type ResultadoSp } from '../../db/executeSp.js';
import type { DatosDireccion, FilaDireccion } from './direcciones.types.js';

/*
 * Todos filtran por @IDUsuarioSolicitante (del JWT) y Activo = 1: la dirección de otro cliente,
 * la inexistente y la dada de baja responden igual, 50004 → 404. Las escrituras pueden lanzar
 * además 50012 (solicitante desactivado). Las direcciones no van a la bitácora.
 */

const solicitante = (idUsuario: number): ParametroSp => ({
  nombre: 'IDUsuarioSolicitante',
  tipo: sql.Int,
  valor: idUsuario,
});

const direccion = (idDireccion: number): ParametroSp => ({
  nombre: 'IDDireccion',
  tipo: sql.Int,
  valor: idDireccion,
});

/** Campos de SP_Direcciones_Crear y _Actualizar; el SP aplica TRIM y vacío → NULL. */
const campos = (datos: DatosDireccion): ParametroSp[] => [
  { nombre: 'Alias', tipo: sql.NVarChar(50), valor: datos.alias },
  { nombre: 'NombreDestinatario', tipo: sql.NVarChar(150), valor: datos.nombreDestinatario },
  { nombre: 'Telefono', tipo: sql.NVarChar(20), valor: datos.telefono },
  { nombre: 'Linea1', tipo: sql.NVarChar(200), valor: datos.linea1 },
  { nombre: 'Linea2', tipo: sql.NVarChar(200), valor: datos.linea2 },
  { nombre: 'Municipio', tipo: sql.NVarChar(100), valor: datos.municipio },
  { nombre: 'Departamento', tipo: sql.NVarChar(100), valor: datos.departamento },
  { nombre: 'CodigoPostal', tipo: sql.NVarChar(10), valor: datos.codigoPostal },
  { nombre: 'Referencias', tipo: sql.NVarChar(300), valor: datos.referencias },
];

function primeraFila<T>(resultado: ResultadoSp<T>, sp: string): T {
  const fila = resultado.filas[0];
  if (!fila) throw new Error(`${sp} no devolvió filas`);
  return fila;
}

export const direccionesRepository = {
  /** Solo las activas, por IDDireccion. */
  async listar(idUsuario: number): Promise<FilaDireccion[]> {
    const { filas } = await executeSp<FilaDireccion>('SP_Direcciones_ListarPorUsuario', [
      solicitante(idUsuario),
    ]);
    return filas;
  },

  async obtener(idUsuario: number, idDireccion: number): Promise<FilaDireccion> {
    const resultado = await executeSp<FilaDireccion>('SP_Direcciones_ObtenerPorId', [
      solicitante(idUsuario),
      direccion(idDireccion),
    ]);
    return primeraFila(resultado, 'SP_Direcciones_ObtenerPorId');
  },

  async crear(idUsuario: number, datos: DatosDireccion): Promise<FilaDireccion> {
    const resultado = await executeSp<FilaDireccion>('SP_Direcciones_Crear', [
      solicitante(idUsuario),
      ...campos(datos),
    ]);
    return primeraFila(resultado, 'SP_Direcciones_Crear');
  },

  async actualizar(
    idUsuario: number,
    idDireccion: number,
    datos: DatosDireccion,
  ): Promise<FilaDireccion> {
    const resultado = await executeSp<FilaDireccion>('SP_Direcciones_Actualizar', [
      solicitante(idUsuario),
      direccion(idDireccion),
      ...campos(datos),
    ]);
    return primeraFila(resultado, 'SP_Direcciones_Actualizar');
  },

  /** Baja lógica: los pedidos conservan su copia de la dirección. 50004 si ya estaba de baja. */
  async desactivar(idUsuario: number, idDireccion: number): Promise<void> {
    await executeSp('SP_Direcciones_Desactivar', [solicitante(idUsuario), direccion(idDireccion)]);
  },
};
