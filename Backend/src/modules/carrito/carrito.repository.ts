import sql from 'mssql';
import { executeSp, type NombreSp, type ParametroSp } from '../../db/executeSp.js';
import type {
  FilaEncabezadoCarrito,
  FilaFusion,
  FilaLineaCarrito,
  Propietario,
  ResultadoCarritoSp,
} from './carrito.types.js';

/*
 * Todos los SPs devuelven el carrito completo: RS1 (encabezado, una fila) y RS2 (líneas); la
 * fusión añade RS3. El IDCarrito nunca lo envía el cliente. Con usuario el SP ignora el token.
 * Un SP que escribe puede lanzar además 50004 (solicitante inexistente) y 50012 (inactivo).
 * El carrito nunca se cachea.
 */

const solicitante = (idUsuario: number): ParametroSp => ({
  nombre: 'IDUsuarioSolicitante',
  tipo: sql.Int,
  valor: idUsuario,
});

/** @IDUsuarioSolicitante (del JWT) o @TokenInvitado, nunca ambos. */
function identificacion(dueno: Propietario): ParametroSp[] {
  if (dueno.idUsuario !== undefined) return [solicitante(dueno.idUsuario)];
  return [{ nombre: 'TokenInvitado', tipo: sql.UniqueIdentifier, valor: dueno.tokenInvitado }];
}

const variante = (idVariante: number): ParametroSp => ({
  nombre: 'IDVariante',
  tipo: sql.Int,
  valor: idVariante,
});

const cantidadParam = (cantidad: number): ParametroSp => ({
  nombre: 'Cantidad',
  tipo: sql.Int,
  valor: cantidad,
});

async function ejecutar(nombre: NombreSp, parametros: ParametroSp[]): Promise<ResultadoCarritoSp> {
  const { resultSets } = await executeSp(nombre, parametros);
  const encabezado = resultSets[0]?.[0] as FilaEncabezadoCarrito | undefined;
  if (!encabezado) throw new Error(`${nombre} no devolvió el encabezado del carrito`);
  const resultado: ResultadoCarritoSp = {
    encabezado,
    lineas: (resultSets[1] ?? []) as FilaLineaCarrito[],
  };
  if (nombre === 'SP_Carrito_FusionarInvitado') {
    resultado.fusion = (resultSets[2] ?? []) as FilaFusion[];
  }
  return resultado;
}

export const carritoRepository = {
  obtener: (dueno: Propietario) => ejecutar('SP_Carrito_Obtener', identificacion(dueno)),

  agregarItem: (dueno: Propietario, idVariante: number, cantidad: number) =>
    ejecutar('SP_Carrito_AgregarItem', [
      ...identificacion(dueno),
      variante(idVariante),
      cantidadParam(cantidad),
    ]),

  actualizarCantidad: (dueno: Propietario, idVariante: number, cantidad: number) =>
    ejecutar('SP_Carrito_ActualizarCantidad', [
      ...identificacion(dueno),
      variante(idVariante),
      cantidadParam(cantidad),
    ]),

  eliminarItem: (dueno: Propietario, idVariante: number) =>
    ejecutar('SP_Carrito_EliminarItem', [...identificacion(dueno), variante(idVariante)]),

  vaciar: (dueno: Propietario) => ejecutar('SP_Carrito_Vaciar', identificacion(dueno)),

  aplicarCupon: (idUsuario: number, codigo: string) =>
    ejecutar('SP_Carrito_AplicarCupon', [
      solicitante(idUsuario),
      { nombre: 'Codigo', tipo: sql.NVarChar(100), valor: codigo },
    ]),

  quitarCupon: (idUsuario: number) => ejecutar('SP_Carrito_QuitarCupon', [solicitante(idUsuario)]),

  fusionarInvitado: (idUsuario: number, tokenInvitado: string) =>
    ejecutar('SP_Carrito_FusionarInvitado', [
      solicitante(idUsuario),
      { nombre: 'TokenInvitado', tipo: sql.UniqueIdentifier, valor: tokenInvitado },
    ]),
};
