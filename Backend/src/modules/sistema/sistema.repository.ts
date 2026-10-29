import { redis } from '../../config/redis.js';
import { executeSp } from '../../db/executeSp.js';

interface FilaConexion {
  BaseDatos: string;
  FechaServidor: Date;
}

export const sistemaRepository = {
  async verificarSqlServer(): Promise<FilaConexion | undefined> {
    const { filas } = await executeSp<FilaConexion>('SP_Sistema_VerificarConexion');
    return filas[0];
  },

  async verificarRedis(): Promise<string> {
    return redis.ping();
  },
};
