/**
 * Prepara la infraestructura de las pruebas de integración:
 *  - SQL Server: contenedor desechable (testcontainers) con la base ShopCart_Test creada por
 *    Database/docker-init.sh, el mismo script que usa docker compose. Con DB_PRUEBAS=true el
 *    script también ejecuta Database/pruebas: si una restricción de integridad deja de
 *    funcionar, la suite de integración falla antes de empezar.
 *    Con TEST_DB_SERVER usa ese servidor (requiere sqlcmd local) y recrea la base.
 *  - Redis: contenedor desechable, o TEST_REDIS_URL si está definido.
 * Las variables de entorno para la app se entregan a los workers con provide/inject.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  MSSQLServerContainer,
  type StartedMSSQLServerContainer,
} from '@testcontainers/mssqlserver';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    testEnv: Record<string, string>;
  }
}

const DIRECTORIO_DATABASE = fileURLToPath(new URL('../../../Database', import.meta.url));
const DB_NAME = 'ShopCart_Test';
const APP_LOGIN = 'shopcart_app';
const APP_PASSWORD = 'ShopCartTest#2026';
const SA_PASSWORD = 'ShopCartTestSa#2026';

async function prepararSqlServer(): Promise<{
  host: string;
  port: number;
  contenedor?: StartedMSSQLServerContainer;
}> {
  const servidorExterno = process.env.TEST_DB_SERVER;
  if (servidorExterno) {
    const port = Number(process.env.TEST_DB_PORT ?? 1433);
    execFileSync('bash', [`${DIRECTORIO_DATABASE}/docker-init.sh`], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DB_SERVER: `${servidorExterno},${port}`,
        DB_USER: process.env.TEST_DB_USER ?? 'sa',
        DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? '',
        APP_DB_PASSWORD: APP_PASSWORD,
        DB_NAME,
        DB_RESET: 'true',
        DB_PRUEBAS: 'true',
      },
    });
    return { host: servidorExterno, port };
  }

  const contenedor = await new MSSQLServerContainer('mcr.microsoft.com/mssql/server:2022-latest')
    .acceptLicense()
    .withPassword(SA_PASSWORD)
    .start();

  await contenedor.copyDirectoriesToContainer([
    { source: DIRECTORIO_DATABASE, target: '/tmp/database' },
  ]);
  const resultado = await contenedor.exec(['bash', '/tmp/database/docker-init.sh'], {
    env: {
      DB_SERVER: 'localhost',
      DB_USER: 'sa',
      DB_PASSWORD: SA_PASSWORD,
      APP_DB_PASSWORD: APP_PASSWORD,
      DB_NAME,
      DB_PRUEBAS: 'true',
    },
  });
  if (resultado.exitCode !== 0) {
    await contenedor.stop();
    throw new Error(`docker-init.sh falló:\n${resultado.output}`);
  }

  return { host: contenedor.getHost(), port: contenedor.getPort(), contenedor };
}

async function prepararRedis(): Promise<{ url: string; contenedor?: StartedRedisContainer }> {
  if (process.env.TEST_REDIS_URL) return { url: process.env.TEST_REDIS_URL };
  const contenedor = await new RedisContainer('redis:7.4-alpine').start();
  return { url: contenedor.getConnectionUrl(), contenedor };
}

export default async function setup(project: TestProject) {
  const [sql, redis] = await Promise.all([prepararSqlServer(), prepararRedis()]);

  project.provide('testEnv', {
    NODE_ENV: 'test',
    DB_SERVER: sql.host,
    DB_PORT: String(sql.port),
    DB_NAME,
    DB_USER: APP_LOGIN,
    DB_PASSWORD: APP_PASSWORD,
    DB_ENCRYPT: 'true',
    DB_TRUST_SERVER_CERTIFICATE: 'true',
    JWT_ACCESS_SECRET: 'secreto-de-pruebas-de-integracion-con-mas-de-32-caracteres',
    CORS_ORIGIN: 'http://localhost:5173',
    REDIS_URL: redis.url,
    // Todas las peticiones llegan desde la misma IP: el límite real (10) frenaría la suite.
    // tests/integration/auth.test.ts prueba el limitador con uno propio de límite bajo.
    RATE_LIMIT_AUTH_MAX: '10000',
  });

  return async () => {
    await Promise.all([sql.contenedor?.stop(), redis.contenedor?.stop()]);
  };
}
