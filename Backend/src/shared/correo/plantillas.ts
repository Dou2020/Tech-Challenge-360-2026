/**
 * Plantillas de los correos transaccionales: HTML y texto plano en español.
 * Todo dato que viene del usuario (nombre) se escapa antes de entrar al HTML.
 * Los enlaces llevan el token en el fragmento (#token=…): no sale en logs ni en el Referer.
 */
import type { MensajeCorreo } from './correo.js';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escaparHtml(valor: string): string {
  return valor.replace(/[&<>"']/g, (caracter) => ESCAPES[caracter] ?? caracter);
}

function pluralizar(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}

/** Vigencia legible: 72 horas → "3 días"; 60 minutos → "1 hora". */
export function describirVigencia(minutos: number): string {
  if (minutos % 1440 === 0) return pluralizar(minutos / 1440, 'día', 'días');
  if (minutos % 60 === 0) return pluralizar(minutos / 60, 'hora', 'horas');
  return pluralizar(minutos, 'minuto', 'minutos');
}

interface Contenido {
  asunto: string;
  titulo: string;
  parrafos: string[];
  boton: { etiqueta: string; enlace: string };
  nota: string;
}

function armar(para: string, contenido: Contenido): MensajeCorreo {
  const { asunto, titulo, parrafos, boton, nota } = contenido;
  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
    <tr><td>
      <h1 style="font-size:20px;margin:0 0 16px">${escaparHtml(titulo)}</h1>
      ${parrafos.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 16px">${p}</p>`).join('\n      ')}
      <p style="margin:24px 0">
        <a href="${escaparHtml(boton.enlace)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px;display:inline-block">${escaparHtml(boton.etiqueta)}</a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#52525b;margin:0 0 8px">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all">${escaparHtml(boton.enlace)}</span></p>
      <p style="font-size:13px;line-height:1.5;color:#52525b;margin:0">${escaparHtml(nota)}</p>
    </td></tr>
  </table>
</body>
</html>`;
  const texto = [
    titulo,
    '',
    ...parrafos.map((p) => p.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')),
    '',
    `${boton.etiqueta}: ${boton.enlace}`,
    '',
    nota,
  ].join('\n');
  return { para, asunto, texto, html };
}

const negrita = (valor: string) => `<strong>${escaparHtml(valor)}</strong>`;
const NOTA_IGNORAR = 'Si no esperabas este correo, puedes ignorarlo: no se hará ningún cambio.';

export interface DatosEnlace {
  para: string;
  nombre: string;
  enlace: string;
  /** Vigencia del enlace en minutos. */
  vigenciaMin: number;
}

/** Cliente que se acaba de registrar: crea su contraseña. */
export function bienvenida({ para, nombre, enlace, vigenciaMin }: DatosEnlace): MensajeCorreo {
  return armar(para, {
    asunto: 'Bienvenido a ShopCart: crea tu contraseña',
    titulo: `Bienvenido a ShopCart, ${nombre}`,
    parrafos: [
      'Tu cuenta ya está creada. Para empezar a comprar, crea tu contraseña con el botón de abajo.',
      `El enlace es de un solo uso y vence en ${negrita(describirVigencia(vigenciaMin))}.`,
    ],
    boton: { etiqueta: 'Crear mi contraseña', enlace },
    nota: NOTA_IGNORAR,
  });
}

/** Usuario creado por un Administrador: crea su contraseña. */
export function invitacion({
  para,
  nombre,
  enlace,
  vigenciaMin,
  rol,
}: DatosEnlace & { rol: string }): MensajeCorreo {
  return armar(para, {
    asunto: 'Te invitaron a ShopCart: crea tu contraseña',
    titulo: `Hola ${nombre}, tienes una cuenta en ShopCart`,
    parrafos: [
      `Un administrador creó tu cuenta con el rol ${negrita(rol)}. Crea tu contraseña con el botón de abajo para ingresar.`,
      `El enlace es de un solo uso y vence en ${negrita(describirVigencia(vigenciaMin))}.`,
    ],
    boton: { etiqueta: 'Crear mi contraseña', enlace },
    nota: NOTA_IGNORAR,
  });
}

/** Recuperación de contraseña pedida por el usuario. */
export function restablecer({ para, nombre, enlace, vigenciaMin }: DatosEnlace): MensajeCorreo {
  return armar(para, {
    asunto: 'Restablece tu contraseña de ShopCart',
    titulo: `Hola ${nombre}, restablece tu contraseña`,
    parrafos: [
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
      `El enlace es de un solo uso y vence en ${negrita(describirVigencia(vigenciaMin))}. Al cambiarla se cerrarán tus sesiones abiertas.`,
    ],
    boton: { etiqueta: 'Restablecer contraseña', enlace },
    nota: 'Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.',
  });
}

/** Alguien intentó registrar un correo que ya tiene cuenta: se le ofrece recuperar el acceso. */
export function cuentaExistente({
  para,
  nombre,
  enlace,
}: Omit<DatosEnlace, 'vigenciaMin'>): MensajeCorreo {
  return armar(para, {
    asunto: 'Ya tienes una cuenta en ShopCart',
    titulo: `Hola ${nombre}, ya tienes una cuenta`,
    parrafos: [
      'Alguien intentó registrarse en ShopCart con este correo, pero ya existe una cuenta con él.',
      'Si fuiste tú y olvidaste tu contraseña, puedes recuperarla con el botón de abajo.',
    ],
    boton: { etiqueta: 'Recuperar mi contraseña', enlace },
    nota: 'Si no fuiste tú, ignora este correo: tu cuenta sigue segura.',
  });
}
