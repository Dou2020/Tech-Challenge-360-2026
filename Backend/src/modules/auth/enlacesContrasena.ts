/**
 * Emite un token de contraseña y manda el correo con su enlace. Lo comparten el registro, la
 * recuperación y las invitaciones del Administrador. Los enlaces llevan el token en el fragmento
 * (#token=…): no viaja al servidor del frontend ni al túnel, y no sale en el Referer.
 */
import { env } from '../../config/env.js';
import { correo } from '../../shared/correo/correo.js';
import { bienvenida, invitacion, restablecer } from '../../shared/correo/plantillas.js';
import {
  tokensContrasenaStore,
  VIGENCIA_TOKEN_MIN,
  type PropositoToken,
} from './tokensContrasena.store.js';

export const RUTA_CREAR_CONTRASENA = '/crear-contrasena';
export const RUTA_RESTABLECER_CONTRASENA = '/restablecer-contrasena';
export const RUTA_RECUPERAR_CONTRASENA = '/recuperar-contrasena';

export function enlaceConToken(ruta: string, token: string): string {
  return `${env.APP_URL_PUBLICA}${ruta}#token=${token}`;
}

export function enlaceRecuperar(): string {
  return `${env.APP_URL_PUBLICA}${RUTA_RECUPERAR_CONTRASENA}`;
}

interface Destinatario {
  idUsuario: number;
  correo: string;
  nombre: string;
}

/** Emite el token y envía el correo en segundo plano. Lanza 503 si Redis no responde. */
export async function enviarEnlaceContrasena(
  tipo: 'bienvenida' | 'invitacion' | 'restablecer',
  destinatario: Destinatario & { rol?: string },
): Promise<void> {
  const proposito: PropositoToken = tipo === 'restablecer' ? 'RESTABLECER' : 'CREAR';
  const token = await tokensContrasenaStore.emitir(destinatario.idUsuario, proposito);
  const datos = {
    para: destinatario.correo,
    nombre: destinatario.nombre,
    vigenciaMin: VIGENCIA_TOKEN_MIN[proposito],
    enlace: enlaceConToken(
      proposito === 'CREAR' ? RUTA_CREAR_CONTRASENA : RUTA_RESTABLECER_CONTRASENA,
      token,
    ),
  };
  if (tipo === 'restablecer') correo.enviarEnSegundoPlano(restablecer(datos));
  else if (tipo === 'bienvenida') correo.enviarEnSegundoPlano(bienvenida(datos));
  else correo.enviarEnSegundoPlano(invitacion({ ...datos, rol: destinatario.rol ?? 'Cliente' }));
}
