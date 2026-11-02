import { logger } from '../../config/logger.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { EventoPedido, OyenteEvento } from '../../shared/eventos/eventos.js';
import type { UsuarioAutenticado } from '../../shared/types/express.js';
import { revocacionStore } from '../auth/revocacion.store.js';

/** Intervalo del latido. Menor que el `proxy_read_timeout` de nginx (60 s). */
export const LATIDO_MS = 25_000;
/** Conexiones simultáneas del stream por usuario. */
export const MAX_CONEXIONES_POR_USUARIO = 5;
/** Espera del cliente antes de reconectar (campo `retry` de SSE). */
const REINTENTO_CLIENTE_MS = 5_000;

/** Por qué el servidor cierra el stream; el cliente decide si renueva el token y reconecta. */
export type MotivoFin = 'REVOCADO' | 'TOKEN_EXPIRADO' | 'SERVIDOR_DETENIDO';

/** Destino de la conexión; lo implementa el controlador sobre `res`. */
export interface SalidaStream {
  /** Escribe los headers SSE y los envía. */
  abrir(): void;
  escribir(texto: string): void;
  terminar(): void;
}

export interface ConexionStream {
  /** Libera la conexión (el cliente se desconectó); no escribe nada. */
  liberar(): void;
}

const conexionesPorUsuario = new Map<number, number>();
const activas = new Set<(motivo: MotivoFin) => void>();

/** Formatea un evento SSE. */
export function formatearEvento(nombre: string, datos: unknown): string {
  return `event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`;
}

/**
 * Abre un stream SSE para el usuario: valida el límite, se suscribe a los eventos, escribe los
 * headers y programa el latido (con revisión de revocación) y el cierre al vencer el token.
 *  - Más de `MAX_CONEXIONES_POR_USUARIO` → 429 DEMASIADAS_SOLICITUDES.
 *  - Si `suscribir` falla se propaga su error antes de escribir nada (503).
 */
export async function abrirStream(
  usuario: UsuarioAutenticado,
  salida: SalidaStream,
  suscribir: (oyente: OyenteEvento) => Promise<() => void>,
): Promise<ConexionStream> {
  const abiertas = conexionesPorUsuario.get(usuario.idUsuario) ?? 0;
  if (abiertas >= MAX_CONEXIONES_POR_USUARIO) {
    throw new AppError(
      'DEMASIADAS_SOLICITUDES',
      `Ya tienes ${MAX_CONEXIONES_POR_USUARIO} conexiones de tiempo real abiertas. Cierra alguna e intenta de nuevo.`,
    );
  }
  // Se reserva el cupo antes del await para que solicitudes simultáneas no lo superen.
  conexionesPorUsuario.set(usuario.idUsuario, abiertas + 1);

  let cancelarSuscripcion: () => void;
  try {
    cancelarSuscripcion = await suscribir((evento: EventoPedido) => {
      escribirSeguro(formatearEvento('pedido', evento));
    });
  } catch (error) {
    bajarContador(usuario.idUsuario);
    throw error;
  }

  let cerrada = false;
  let revisando = false;

  function escribirSeguro(texto: string): void {
    if (cerrada) return;
    try {
      salida.escribir(texto);
    } catch (error) {
      logger.warn({ err: error }, 'No se pudo escribir en el stream de reportes');
      liberar();
    }
  }

  function liberar(): void {
    if (cerrada) return;
    cerrada = true;
    clearInterval(latido);
    clearTimeout(vencimiento);
    cancelarSuscripcion();
    activas.delete(finalizar);
    bajarContador(usuario.idUsuario);
  }

  function finalizar(motivo: MotivoFin): void {
    if (cerrada) return;
    try {
      salida.escribir(formatearEvento('fin', { motivo }));
      salida.terminar();
    } catch (error) {
      logger.warn({ err: error }, 'No se pudo cerrar el stream de reportes');
    }
    liberar();
  }

  const latido = setInterval(() => {
    if (revisando) return;
    revisando = true;
    void (async () => {
      try {
        escribirSeguro(': ping\n\n');
        // Redis caído también cierra: no se puede garantizar que el token siga vigente.
        if (await revocacionStore.estaRevocado(usuario)) finalizar('REVOCADO');
      } catch {
        finalizar('REVOCADO');
      } finally {
        revisando = false;
      }
    })();
  }, LATIDO_MS);

  const vencimiento = setTimeout(
    () => finalizar('TOKEN_EXPIRADO'),
    Math.max(usuario.exp * 1000 - Date.now(), 0),
  );

  activas.add(finalizar);
  salida.abrir();
  salida.escribir(`retry: ${REINTENTO_CLIENTE_MS}\n\n`);
  salida.escribir(formatearEvento('conectado', { fecha: new Date().toISOString() }));

  return { liberar };
}

function bajarContador(idUsuario: number): void {
  const restantes = (conexionesPorUsuario.get(idUsuario) ?? 1) - 1;
  if (restantes <= 0) conexionesPorUsuario.delete(idUsuario);
  else conexionesPorUsuario.set(idUsuario, restantes);
}

/** Cierra todos los streams abiertos (apagado), para que `server.close()` no quede esperando. */
export function cerrarConexionesStream(): void {
  for (const finalizar of [...activas]) finalizar('SERVIDOR_DETENIDO');
}
