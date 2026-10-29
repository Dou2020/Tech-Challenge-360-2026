import type { RequestHandler } from 'express';
import { sistemaService } from './sistema.service.js';

export const sistemaController = {
  health: (async (_req, res) => {
    const estado = await sistemaService.obtenerEstado();
    // Sin SQL Server la API no puede atender: 503 para que el orquestador lo detecte.
    res.status(estado.sqlServer === 'up' ? 200 : 503).json(estado);
  }) satisfies RequestHandler,
};
