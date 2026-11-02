import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { Rol, UsuarioAutenticado } from '../../shared/types/express.js';
import { ROLES, type AccessTokenEmitido } from './auth.types.js';

export const EMISOR_TOKEN = 'shopcart';
export const AUDIENCIA_TOKEN = 'shopcart-api';
const ALGORITMO = 'HS256';

const SEGUNDOS_POR_UNIDAD: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400 };

/** Convierte 15m, 900s, 1h o 900 a segundos (el formato lo valida env.ts). */
export function aSegundos(duracion: string): number {
  const coincidencia = /^(\d+)([smhd]?)$/.exec(duracion);
  if (!coincidencia) throw new Error(`Duración inválida: ${duracion}`);
  return Number(coincidencia[1]) * (SEGUNDOS_POR_UNIDAD[coincidencia[2] || 's'] ?? 1);
}

/** Vida del access token en segundos (900 con el valor por defecto). */
export const DURACION_ACCESS_SEG = aSegundos(env.JWT_ACCESS_EXPIRES_IN);

/** Claims del access token ya verificado. */
export type ClaimsAccessToken = UsuarioAutenticado;

const esquemaClaims = z.object({
  sub: z.string().regex(/^\d+$/),
  rol: z.enum(ROLES),
  sid: z.string().min(1),
  jti: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
});

export function firmarAccessToken(datos: {
  idUsuario: number;
  rol: Rol;
  sid: string;
}): AccessTokenEmitido {
  const accessToken = jwt.sign({ rol: datos.rol, sid: datos.sid }, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITMO,
    expiresIn: DURACION_ACCESS_SEG,
    subject: String(datos.idUsuario),
    jwtid: randomUUID(),
    issuer: EMISOR_TOKEN,
    audience: AUDIENCIA_TOKEN,
  });
  return { accessToken, expiraEn: DURACION_ACCESS_SEG };
}

function aClaims(payload: unknown): ClaimsAccessToken {
  const resultado = esquemaClaims.safeParse(payload);
  if (!resultado.success) {
    throw new AppError('NO_AUTENTICADO', 'El token de acceso no es válido.');
  }
  const { sub, rol, sid, jti, iat, exp } = resultado.data;
  return { idUsuario: Number(sub), rol, sid, jti, iat, exp };
}

/** Verifica firma, emisor, audiencia y vigencia. Lanza 401 TOKEN_EXPIRADO o NO_AUTENTICADO. */
export function verificarAccessToken(token: string): ClaimsAccessToken {
  let payload: unknown;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: [ALGORITMO],
      issuer: EMISOR_TOKEN,
      audience: AUDIENCIA_TOKEN,
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('TOKEN_EXPIRADO', 'El token de acceso venció.');
    }
    throw new AppError('NO_AUTENTICADO', 'El token de acceso no es válido.');
  }
  return aClaims(payload);
}

/**
 * Para el logout: acepta un token con firma válida aunque haya vencido.
 * Devuelve undefined si el token no es nuestro o está mal formado.
 */
export function leerAccessTokenParaRevocar(token: string): ClaimsAccessToken | undefined {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: [ALGORITMO],
      issuer: EMISOR_TOKEN,
      audience: AUDIENCIA_TOKEN,
      ignoreExpiration: true,
    });
    return aClaims(payload);
  } catch {
    return undefined;
  }
}

/** Token del header Authorization: Bearer <token>, o undefined. */
export function extraerBearer(header: string | undefined): string | undefined {
  const coincidencia = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return coincidencia?.[1];
}

// --- Refresh token ---

/**
 * Formato `<sid>.<secreto>`: la familia viaja en el token para que la rotación declare
 * todas sus claves de Redis; el secreto son 32 bytes aleatorios. En Redis solo se guarda
 * el SHA-256 del token completo.
 */
const PATRON_REFRESH = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/;

export function generarRefreshToken(sid: string): string {
  return `${sid}.${randomBytes(32).toString('base64url')}`;
}

/** Familia (sid) del refresh token, o undefined si no tiene el formato esperado. */
export function familiaDeRefreshToken(token: string): string | undefined {
  return PATRON_REFRESH.exec(token)?.[1];
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
