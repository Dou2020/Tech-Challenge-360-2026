import sql from 'mssql';
import { executeSp, type NombreSp, type ParametroSp } from '../../db/executeSp.js';
import type {
  DatosPago,
  FilaLiberacionReserva,
  FilaLineaCheckout,
  FilaPedidoCreado,
  FilaResumenCheckout,
  ResultadoResumenSp,
} from './checkout.types.js';

/*
 * El IDUsuarioSolicitante sale siempre del JWT. Los SPs de escritura pueden lanzar además 50004
 * (dirección, método o tarjeta ajenos/inexistentes) y 50012 (usuario inactivo). Con tarjeta
 * guardada y `guardar` a la vez, o `guardar` sin tipo o marca, lanza 50001.
 */

/** Valores válidos (distintos de 0000) que el SP descarta al pagar con una tarjeta guardada. */
const PLACEHOLDER_TITULAR = 'Tarjeta guardada';
const PLACEHOLDER_ULTIMOS4 = '0001';

const solicitante = (idUsuario: number): ParametroSp => ({
  nombre: 'IDUsuarioSolicitante',
  tipo: sql.Int,
  valor: idUsuario,
});

async function resumen(nombre: NombreSp, parametros: ParametroSp[]): Promise<ResultadoResumenSp> {
  const { resultSets } = await executeSp(nombre, parametros);
  const encabezado = resultSets[0]?.[0] as FilaResumenCheckout | undefined;
  if (!encabezado) throw new Error(`${nombre} no devolvió el resumen del checkout`);
  return { encabezado, lineas: (resultSets[1] ?? []) as FilaLineaCheckout[] };
}

export const checkoutRepository = {
  reservar: (idUsuario: number, idDireccion: number, idMetodoEnvio: number) =>
    resumen('SP_Inventario_ReservarExistencia', [
      solicitante(idUsuario),
      { nombre: 'IDDireccion', tipo: sql.Int, valor: idDireccion },
      { nombre: 'IDMetodoEnvio', tipo: sql.Int, valor: idMetodoEnvio },
    ]),

  obtenerResumen: (idUsuario: number, idMetodoEnvio: number | null) =>
    resumen('SP_Checkout_ObtenerResumen', [
      solicitante(idUsuario),
      { nombre: 'IDMetodoEnvio', tipo: sql.Int, valor: idMetodoEnvio },
    ]),

  async liberarReserva(idUsuario: number): Promise<FilaLiberacionReserva> {
    const { filas } = await executeSp<FilaLiberacionReserva>('SP_Inventario_LiberarReserva', [
      solicitante(idUsuario),
    ]);
    const fila = filas[0];
    if (!fila) throw new Error('SP_Inventario_LiberarReserva no devolvió resultado');
    return fila;
  },

  async crearPedido(
    idUsuario: number,
    claveIdempotencia: string,
    datos: DatosPago,
  ): Promise<FilaPedidoCreado> {
    const { filas } = await executeSp<FilaPedidoCreado>('SP_Pedidos_CrearPedido', [
      solicitante(idUsuario),
      { nombre: 'ClaveIdempotencia', tipo: sql.UniqueIdentifier, valor: claveIdempotencia },
      { nombre: 'IDDireccion', tipo: sql.Int, valor: datos.idDireccion },
      { nombre: 'IDMetodoEnvio', tipo: sql.Int, valor: datos.idMetodoEnvio },
      { nombre: 'MetodoPago', tipo: sql.NVarChar(20), valor: datos.metodoPago },
      // Con tarjeta guardada el SP ignora titular y últimos 4 y toma los de la tarjeta.
      {
        nombre: 'TitularTarjeta',
        tipo: sql.NVarChar(150),
        valor: datos.titular ?? PLACEHOLDER_TITULAR,
      },
      {
        nombre: 'UltimosTarjeta',
        tipo: sql.Char(4),
        valor: datos.ultimos4 ?? PLACEHOLDER_ULTIMOS4,
      },
      { nombre: 'IDTarjetaGuardada', tipo: sql.Int, valor: datos.idTarjeta },
      { nombre: 'TipoTarjeta', tipo: sql.NVarChar(10), valor: datos.tipo },
      { nombre: 'MarcaTarjeta', tipo: sql.NVarChar(20), valor: datos.marca },
      { nombre: 'GuardarTarjeta', tipo: sql.Bit, valor: datos.guardar },
    ]);
    const fila = filas[0];
    if (!fila) throw new Error('SP_Pedidos_CrearPedido no devolvió el pedido');
    return fila;
  },
};
