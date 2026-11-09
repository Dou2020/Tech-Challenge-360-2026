import { EventEmitter } from 'node:events';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import { claves } from '../cache/claves.js';
import { AppError } from '../errors/AppError.js';

/** Qué ocurrió con el pedido; coincide con los puntos que invalidan la caché de reportes. */
export type TipoEventoPedido = 'CREADO' | 'CANCELADO' | 'ESTADO' | 'DEVOLUCION';

/**
 * Aviso de que un pedido cambió. No lleva montos: quien lo recibe vuelve a pedir los datos
 * (reportes, listas y detalle de pedidos).
 */
export interface EventoPedido {
  tipo: TipoEventoPedido;
  idPedido: number;
  /** Dueño del pedido (no quien hizo el cambio): el stream de pedidos filtra por él al Cliente. */
  idUsuario: number;
  estado: string;
  /** ISO 8601 UTC. */
  fecha: string;
}

export type OyenteEvento = (evento: EventoPedido) => void;

/** Lo que usa el publicador del cliente principal. */
interface ClientePublicador {
  publish(canal: string, mensaje: string): Promise<unknown>;
  duplicate(): ClienteSuscriptor;
}

/** Lo que usa el suscriptor (conexión dedicada: en modo suscripción no admite otros comandos). */
interface ClienteSuscriptor {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  subscribe(canal: string, oyente: (mensaje: string) => void): Promise<unknown>;
  close(): Promise<unknown>;
  on(evento: 'error', oyente: (error: Error) => void): unknown;
}

/** Espera máxima para conectar el suscriptor antes de responder 503. */
const ESPERA_CONEXION_MS = 3_000;

/**
 * Reparto de eventos por Redis pub/sub. Fábrica con el cliente inyectable (como `crearCache`).
 * El mensaje no es un dato de negocio: no se guarda, solo se reenvía a las instancias.
 */
export function crearEventos(cliente: ClientePublicador, esperaConexionMs = ESPERA_CONEXION_MS) {
  const emisor = new EventEmitter();
  emisor.setMaxListeners(0);
  let suscriptor: ClienteSuscriptor | null = null;
  let iniciando: Promise<void> | null = null;

  /**
   * Publica el evento. Fail-open: si Redis falla se registra el error y no se propaga, porque
   * la escritura que lo origina ya se confirmó en SQL Server.
   */
  async function publicar(evento: EventoPedido): Promise<void> {
    try {
      await cliente.publish(claves.canalReportes(), JSON.stringify(evento));
    } catch (error) {
      logger.error({ err: error, evento }, 'No se pudo publicar el evento de pedido');
    }
  }

  function alRecibir(mensaje: string): void {
    try {
      emisor.emit('pedido', JSON.parse(mensaje) as EventoPedido);
    } catch (error) {
      logger.warn({ err: error }, 'Evento de pedido ilegible descartado');
    }
  }

  async function conectarSuscriptor(): Promise<void> {
    const nuevo = cliente.duplicate();
    nuevo.on('error', (error) => logger.warn({ err: error }, 'Error del suscriptor de Redis'));
    let temporizador: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        (async () => {
          await nuevo.connect();
          await nuevo.subscribe(claves.canalReportes(), alRecibir);
        })(),
        new Promise<never>((_, rechazar) => {
          temporizador = setTimeout(
            () => rechazar(new Error('Tiempo agotado al conectar el suscriptor')),
            esperaConexionMs,
          );
        }),
      ]);
      suscriptor = nuevo;
    } catch (error) {
      await nuevo.close().catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(temporizador);
    }
  }

  /**
   * Registra un oyente local y devuelve la función que lo cancela. El suscriptor de Redis se
   * crea en la primera llamada. Si no puede conectarse: 503 SERVICIO_NO_DISPONIBLE.
   */
  async function suscribir(oyente: OyenteEvento): Promise<() => void> {
    if (suscriptor === null) {
      iniciando ??= conectarSuscriptor().finally(() => {
        iniciando = null;
      });
      try {
        await iniciando;
      } catch (error) {
        logger.error({ err: error }, 'No se pudo suscribir al canal de eventos');
        throw new AppError(
          'SERVICIO_NO_DISPONIBLE',
          'El servicio de eventos no está disponible. Intenta de nuevo en unos segundos.',
        );
      }
    }
    emisor.on('pedido', oyente);
    return () => {
      emisor.off('pedido', oyente);
    };
  }

  /** Cierra el suscriptor (apagado del servidor y `afterAll` de las pruebas). */
  async function cerrarSuscriptor(): Promise<void> {
    const actual = suscriptor;
    suscriptor = null;
    emisor.removeAllListeners('pedido');
    if (actual?.isOpen) await actual.close();
  }

  return { publicar, suscribir, cerrarSuscriptor };
}

export const eventos = crearEventos(redis);
