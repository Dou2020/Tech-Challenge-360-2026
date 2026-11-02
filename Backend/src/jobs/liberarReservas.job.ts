import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { inventarioService } from '../modules/inventario/inventario.service.js';
import type { ResultadoLiberacion } from '../modules/inventario/inventario.types.js';

/*
 * Libera las reservas de existencia vencidas (SP_Inventario_LiberarReservasVencidas) cada
 * RESERVAS_JOB_INTERVAL_MS. Solo pone al día Variante.ExistenciaReservada: los SPs de checkout y
 * pedidos ya ignoran las reservas vencidas aunque el job no haya corrido.
 *
 * - Sin solapamiento: si la pasada anterior sigue en curso, la nueva se omite.
 * - Un error se registra en el log y no tumba el proceso; la siguiente pasada lo reintenta.
 * - Solo registra en `info` cuando liberó algo, para no llenar el log cada minuto.
 * - Lo arranca src/server.ts (no createApp(), para que las pruebas no lo ejecuten solas).
 */

let enCurso: Promise<ResultadoLiberacion | null> | null = null;
let temporizador: NodeJS.Timeout | null = null;

/**
 * Ejecuta una pasada. Devuelve los contadores, o null si se omitió porque la anterior seguía
 * en curso o si falló (el error queda en el log). Nunca rechaza.
 */
export function ejecutarLiberacionReservas(): Promise<ResultadoLiberacion | null> {
  if (enCurso) {
    logger.debug('Liberación de reservas omitida: la pasada anterior sigue en curso');
    return Promise.resolve(null);
  }
  enCurso = (async () => {
    try {
      const resultado = await inventarioService.liberarReservasVencidas();
      if (resultado.reservasLiberadas > 0) {
        logger.info(resultado, 'Reservas vencidas liberadas');
      }
      return resultado;
    } catch (error) {
      logger.error({ err: error }, 'Falló la liberación de reservas vencidas');
      return null;
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

/** Programa el job. Llamarlo de nuevo no crea un segundo intervalo. */
export function iniciarJobLiberarReservas(
  intervaloMs: number = env.RESERVAS_JOB_INTERVAL_MS,
): void {
  if (temporizador) return;
  temporizador = setInterval(() => void ejecutarLiberacionReservas(), intervaloMs);
  // No mantiene vivo el proceso por sí solo: el cierre ordenado no tiene que esperarlo.
  temporizador.unref();
  logger.info(`Job de liberación de reservas cada ${intervaloMs} ms`);
}

/** Detiene el intervalo y espera la pasada en curso, para cerrar el pool después. */
export async function detenerJobLiberarReservas(): Promise<void> {
  if (temporizador) {
    clearInterval(temporizador);
    temporizador = null;
  }
  await enCurso;
}
