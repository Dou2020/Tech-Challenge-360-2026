export type EstadoDependencia = 'up' | 'down';

export interface EstadoSistema {
  /** ok: todo responde; degradado: SQL Server responde pero Redis no; caido: SQL Server no responde. */
  status: 'ok' | 'degradado' | 'caido';
  sqlServer: EstadoDependencia;
  redis: EstadoDependencia;
  timestamp: string;
}
