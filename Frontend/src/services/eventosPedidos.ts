import { tokenStore } from '../auth/tokenStore';
import type { EventoPedido } from '../types/pedidos';
import { API_URL, renovarSesion } from './http';

/** Espera antes de reconectar tras un corte; el servidor la sugiere con `retry:`. */
export const REINTENTO_BASE_MS = 5_000;
/** Tope del backoff exponencial entre reconexiones. */
export const REINTENTO_MAXIMO_MS = 60_000;
/** Con 429 (más de 5 conexiones del usuario, p. ej. muchas pestañas) se espera más. */
export const ESPERA_LIMITE_MS = 60_000;

/** Un bloque SSE ya separado: nombre del evento, datos y `retry` si vino. */
export interface BloqueSse {
  evento: string;
  datos: string;
  retry?: number;
}

/**
 * Separa los bloques completos (terminados en una línea en blanco) del texto recibido. Lo que
 * queda sin terminar vuelve en `resto` para juntarlo con el siguiente fragmento.
 */
export function separarBloques(texto: string): { bloques: BloqueSse[]; resto: string } {
  const partes = texto.replace(/\r\n?/g, '\n').split('\n\n');
  const resto = partes.pop() ?? '';
  const bloques: BloqueSse[] = [];
  for (const parte of partes) {
    let evento = 'message';
    const datos: string[] = [];
    let retry: number | undefined;
    for (const linea of parte.split('\n')) {
      if (linea === '' || linea.startsWith(':')) continue; // comentario (latido)
      const separador = linea.indexOf(':');
      const campo = separador < 0 ? linea : linea.slice(0, separador);
      const valor = separador < 0 ? '' : linea.slice(separador + 1).replace(/^ /, '');
      if (campo === 'event') evento = valor;
      else if (campo === 'data') datos.push(valor);
      else if (campo === 'retry' && /^\d+$/.test(valor)) retry = Number(valor);
    }
    if (datos.length > 0 || retry !== undefined)
      bloques.push({ evento, datos: datos.join('\n'), ...(retry === undefined ? {} : { retry }) });
  }
  return { bloques, resto };
}

/** Cómo terminó una conexión; decide qué hace el bucle de reconexión. */
type Fin = 'ABORTADO' | 'DETENER' | 'RENOVAR' | 'LIMITE' | 'CORTE';

interface Opciones {
  onEvento: (evento: EventoPedido) => void;
  /** Cada vez que el servidor confirma la conexión (también tras reconectar). */
  onConectado?: () => void;
  signal: AbortSignal;
}

/** Espera `ms` o hasta que se aborte, lo que ocurra primero. */
function esperar(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(() => {
      signal.removeEventListener('abort', alAbortar);
      resolver();
    }, ms);
    function alAbortar() {
      clearTimeout(temporizador);
      resolver();
    }
    signal.addEventListener('abort', alAbortar, { once: true });
  });
}

/**
 * Escucha `GET /api/pedidos/stream` hasta que se aborte `signal`. Se lee con `fetch` porque
 * `EventSource` no admite el header `Authorization`. Reconecta sola:
 *  - `fin` TOKEN_EXPIRADO o 401 → renueva la sesión (renovación compartida) y reconecta; si no
 *    se puede renovar, se detiene (la próxima petición normal avisa que la sesión expiró).
 *  - `fin` REVOCADO, 403 u otro 4xx → se detiene.
 *  - Corte de red, `fin` SERVIDOR_DETENIDO o 5xx → reintenta con backoff (5 s a 60 s).
 *  - 429 → reintenta en 60 s.
 */
export async function escucharEventosPedidos({ onEvento, onConectado, signal }: Opciones) {
  let espera = REINTENTO_BASE_MS;
  let renovoSinConectar = false;

  async function conectar(): Promise<Fin> {
    const token = tokenStore.get();
    let respuesta: Response;
    try {
      respuesta = await fetch(`${API_URL}/pedidos/stream`, {
        headers: {
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        signal,
      });
    } catch {
      return signal.aborted ? 'ABORTADO' : 'CORTE';
    }
    if (respuesta.status === 401) return 'RENOVAR';
    if (respuesta.status === 429) return 'LIMITE';
    if (respuesta.status >= 500) return 'CORTE';
    if (!respuesta.ok || !respuesta.body) return 'DETENER';

    const lector = respuesta.body.getReader();
    const decodificador = new TextDecoder();
    let pendiente = '';
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) return 'CORTE';
        const { bloques, resto } = separarBloques(
          pendiente + decodificador.decode(value, { stream: true }),
        );
        pendiente = resto;
        for (const b of bloques) {
          if (b.retry !== undefined) espera = b.retry;
          if (b.evento === 'conectado') {
            espera = REINTENTO_BASE_MS;
            renovoSinConectar = false;
            onConectado?.();
          } else if (b.evento === 'pedido') {
            onEvento(JSON.parse(b.datos) as EventoPedido);
          } else if (b.evento === 'fin') {
            const { motivo } = JSON.parse(b.datos) as { motivo?: string };
            await lector.cancel().catch(() => undefined);
            if (motivo === 'TOKEN_EXPIRADO') return 'RENOVAR';
            if (motivo === 'REVOCADO') return 'DETENER';
            return 'CORTE';
          }
        }
      }
    } catch {
      return signal.aborted ? 'ABORTADO' : 'CORTE';
    }
  }

  while (!signal.aborted) {
    const fin = await conectar();
    if (fin === 'ABORTADO' || fin === 'DETENER') return;
    if (fin === 'RENOVAR') {
      // Un 401 justo después de renovar no se arregla renovando otra vez.
      if (renovoSinConectar || !(await renovarSesion())) return;
      renovoSinConectar = true;
      continue;
    }
    if (fin === 'LIMITE') {
      await esperar(ESPERA_LIMITE_MS, signal);
      continue;
    }
    await esperar(espera, signal);
    espera = Math.min(espera * 2, REINTENTO_MAXIMO_MS);
  }
}
