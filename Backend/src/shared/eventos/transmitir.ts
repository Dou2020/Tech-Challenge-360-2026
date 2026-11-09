import type { Request, Response } from 'express';
import { eventos } from './eventos.js';
import { abrirStream, type FiltroEvento } from './stream.js';

/**
 * Atiende una petición SSE: abre el stream sobre `res` y lo suscribe al reparto de eventos.
 * Si el límite o la suscripción fallan se propaga el error (429/503) antes de escribir ningún
 * header, así que el errorHandler responde con el formato normal.
 */
export async function transmitirEventos(
  req: Request,
  res: Response,
  filtro?: FiltroEvento,
): Promise<void> {
  const conexion = await abrirStream(
    req.usuario!,
    {
      abrir: () => {
        res.status(200).set({
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
      },
      escribir: (texto) => {
        res.write(texto);
      },
      terminar: () => {
        res.end();
      },
    },
    (oyente) => eventos.suscribir(oyente),
    filtro,
  );
  req.on('close', conexion.liberar);
  if (req.destroyed) conexion.liberar();
}
