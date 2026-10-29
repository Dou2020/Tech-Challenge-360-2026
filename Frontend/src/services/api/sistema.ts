import { request } from '../http';

export type EstadoDependencia = 'up' | 'down';

export interface EstadoSistema {
  status: 'ok' | 'degradado' | 'caido';
  sqlServer: EstadoDependencia;
  redis: EstadoDependencia;
  timestamp: string;
}

export const sistemaApi = {
  /** GET /api/health. Responde 503 con el mismo cuerpo cuando SQL Server no responde. */
  obtenerEstado: () => request<EstadoSistema>('/health', { estadosValidos: [503] }),
};
