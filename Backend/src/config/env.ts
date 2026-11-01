import { z } from 'zod';

const booleano = z.enum(['true', 'false']).transform((valor) => valor === 'true');

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DB_SERVER: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_ENCRYPT: booleano.default(true),
  DB_TRUST_SERVER_CERTIFICATE: booleano.default(false),

  JWT_ACCESS_SECRET: z.string().min(32, 'Debe tener al menos 32 caracteres'),
  // Número seguido de s, m, h o d (15m, 900s, 1h); sin unidad son segundos.
  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]?$/, 'Usa un número seguido de s, m, h o d (ej. 15m)')
    .default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),

  CORS_ORIGIN: z.url(),
  RESERVAS_JOB_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

  REDIS_URL: z.url(),
  CACHE_ENABLED: booleano.default(true),
  CACHE_TTL_REPORTES_SEG: z.coerce.number().int().positive().default(300),
  CACHE_TTL_CATALOGO_SEG: z.coerce.number().int().positive().default(600),
  LOGIN_MAX_INTENTOS: z.coerce.number().int().positive().default(5),
  LOGIN_BLOQUEO_MIN: z.coerce.number().int().positive().default(15),
  // Solicitudes por IP en login y registro en cada ventana; 0 desactiva el límite.
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(0).default(10),
  RATE_LIMIT_AUTH_VENTANA_MIN: z.coerce.number().int().positive().default(15),
});

export type Env = z.infer<typeof esquema>;

function cargarEnv(): Env {
  const resultado = esquema.safeParse(process.env);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Variables de entorno inválidas o faltantes:\n${detalle}`);
    process.exit(1);
  }
  return resultado.data;
}

export const env = cargarEnv();
