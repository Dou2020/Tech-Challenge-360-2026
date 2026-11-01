import { argon2id, hash, verify } from 'argon2';
import { logger } from '../../config/logger.js';

/**
 * Argon2id con los parámetros por defecto de la librería (64 MiB, 3 iteraciones, 4 hilos).
 * El hash es una cadena PHC ($argon2id$v=19$m=65536,t=3,p=4$…) que guarda sal y parámetros.
 */
export function hashearContrasena(contrasena: string): Promise<string> {
  return hash(contrasena, { type: argon2id });
}

/** true si la contraseña corresponde al hash. Un hash corrupto cuenta como no válido. */
export async function verificarContrasena(
  hashGuardado: string,
  contrasena: string,
): Promise<boolean> {
  try {
    return await verify(hashGuardado, contrasena);
  } catch (error) {
    logger.error({ err: error }, 'Hash de contraseña inválido en la base');
    return false;
  }
}

let hashFicticio: Promise<string> | undefined;

/**
 * Verifica la contraseña contra un hash que no corresponde a nadie. Se usa cuando el correo
 * no existe para que la respuesta tarde lo mismo y no revele qué correos están registrados.
 * Siempre resuelve false.
 */
export async function verificarContraHashFicticio(contrasena: string): Promise<false> {
  hashFicticio ??= hashearContrasena('contrasena-ficticia-para-tiempo-constante');
  await verificarContrasena(await hashFicticio, contrasena);
  return false;
}
