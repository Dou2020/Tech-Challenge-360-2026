import sql from 'mssql';
import { env } from './env.js';

let pool: sql.ConnectionPool | undefined;
let conectando: Promise<sql.ConnectionPool> | undefined;

/** Pool único de conexiones; se conecta en el primer uso. */
export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  if (!conectando) {
    const nuevo = new sql.ConnectionPool({
      server: env.DB_SERVER,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      options: {
        encrypt: env.DB_ENCRYPT,
        trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
      },
      pool: { max: 20, min: 0, idleTimeoutMillis: 30_000 },
    });
    conectando = nuevo
      .connect()
      .then((conectado) => {
        pool = conectado;
        return conectado;
      })
      .finally(() => {
        conectando = undefined;
      });
  }
  return conectando;
}

export async function closePool(): Promise<void> {
  await pool?.close();
  pool = undefined;
}
