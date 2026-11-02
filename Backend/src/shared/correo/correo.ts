/**
 * Envío de correo transaccional (bienvenida, crear y recuperar contraseña).
 *
 * Dos transportes, elegidos con CORREO_TRANSPORTE:
 *   smtp     nodemailer contra SMTP_HOST (Mailpit en desarrollo, el proveedor real en producción)
 *   memoria  guarda los mensajes en `bandeja`; lo usan las pruebas para leer los enlaces
 *
 * Los correos de las rutas públicas se mandan con `enviarEnSegundoPlano`: la respuesta no espera
 * al servidor SMTP. Así el tiempo de respuesta no revela si el correo existe y una caída del SMTP
 * no impide escribir en la base; el fallo solo se registra en el log.
 */
import { createTransport } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface MensajeCorreo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export interface MensajeEnviado extends MensajeCorreo {
  /** ISO 8601 UTC del momento en que se entregó al transporte. */
  enviadoEn: string;
}

export interface Correo {
  /** Espera la entrega al servidor SMTP; lanza si falla. */
  enviar(mensaje: MensajeCorreo): Promise<void>;
  /** No espera: un fallo solo se registra en el log. */
  enviarEnSegundoPlano(mensaje: MensajeCorreo): void;
}

/** Correo de transporte `memoria`: los mensajes quedan en `bandeja`. */
export interface CorreoEnMemoria extends Correo {
  readonly bandeja: MensajeEnviado[];
  vaciarBandeja(): void;
}

function conSegundoPlano(
  enviar: Correo['enviar'],
): Pick<Correo, 'enviar' | 'enviarEnSegundoPlano'> {
  return {
    enviar,
    enviarEnSegundoPlano(mensaje) {
      enviar(mensaje).catch((error: unknown) => {
        // Sin el destinatario completo en el log: solo el dominio.
        logger.error(
          { err: error, dominio: mensaje.para.split('@')[1], asunto: mensaje.asunto },
          'No se pudo enviar el correo',
        );
      });
    },
  };
}

export interface OpcionesSmtp {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
  remitente: string;
}

export function crearCorreoSmtp(opciones: OpcionesSmtp): Correo {
  const transporte = createTransport({
    host: opciones.host,
    port: opciones.port,
    secure: opciones.secure,
    ...(opciones.user ? { auth: { user: opciones.user, pass: opciones.password ?? '' } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return conSegundoPlano(async (mensaje) => {
    await transporte.sendMail({
      from: opciones.remitente,
      to: mensaje.para,
      subject: mensaje.asunto,
      text: mensaje.texto,
      html: mensaje.html,
    });
  });
}

export function crearCorreoEnMemoria(): CorreoEnMemoria {
  const bandeja: MensajeEnviado[] = [];
  return {
    bandeja,
    vaciarBandeja: () => {
      bandeja.length = 0;
    },
    ...conSegundoPlano((mensaje) => {
      bandeja.push({ ...mensaje, enviadoEn: new Date().toISOString() });
      return Promise.resolve();
    }),
  };
}

function crearCorreo(): Correo | CorreoEnMemoria {
  if (env.CORREO_TRANSPORTE === 'memoria') return crearCorreoEnMemoria();
  return crearCorreoSmtp({
    host: env.SMTP_HOST!,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    remitente: env.CORREO_REMITENTE!,
  });
}

/** Correo de la aplicación, según el entorno. */
export const correo = crearCorreo();

/** La bandeja del transporte `memoria`; undefined con smtp. Para las pruebas. */
export function bandejaEnMemoria(): CorreoEnMemoria | undefined {
  return 'bandeja' in correo ? correo : undefined;
}
