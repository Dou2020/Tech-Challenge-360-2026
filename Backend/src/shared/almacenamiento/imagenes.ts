/**
 * Imágenes de producto en el disco del servidor (IMAGENES_DIR).
 *
 * El tipo se decide por los bytes mágicos del archivo, no por el Content-Type ni la extensión
 * que declaró el cliente. El nombre es un UUID generado aquí: nada del cliente llega a la ruta.
 * La URL que se guarda en ProductoImagen es relativa: /api/imagenes/productos/<uuid>.<ext>;
 * app.ts la sirve con express.static.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';

export type TipoImagen = 'jpg' | 'png' | 'webp';

export const PREFIJO_URL = '/api/imagenes/productos/';

const NOMBRE_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** JPEG, PNG o WebP según los primeros bytes; undefined si no es ninguno. */
export function detectarTipo(buffer: Buffer): TipoImagen | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return undefined;
}

const directorioProductos = () => path.resolve(env.IMAGENES_DIR, 'productos');

export const imagenes = {
  /** Directorio que app.ts publica en /api/imagenes. */
  raiz: () => path.resolve(env.IMAGENES_DIR),

  /**
   * Guarda la imagen y devuelve su URL relativa. Escribe en un temporal y lo renombra, así
   * nunca queda un archivo a medias bajo el nombre definitivo. undefined si el tipo no es válido.
   */
  async guardar(buffer: Buffer): Promise<string | undefined> {
    const tipo = detectarTipo(buffer);
    if (!tipo) return undefined;

    const directorio = directorioProductos();
    await mkdir(directorio, { recursive: true });
    const nombre = `${randomUUID()}.${tipo}`;
    const temporal = path.join(directorio, `.${nombre}.tmp`);
    try {
      await writeFile(temporal, buffer, { flag: 'wx', mode: 0o644 });
      await rename(temporal, path.join(directorio, nombre));
    } catch (error) {
      await unlink(temporal).catch(() => undefined);
      throw error;
    }
    return `${PREFIJO_URL}${nombre}`;
  },

  /**
   * Borra el archivo de una URL que generó `guardar`. Ignora las URL externas (http/https) y
   * cualquier otra cosa: solo actúa sobre el prefijo propio y con un nombre de archivo exacto,
   * así que una URL manipulada no puede salir del directorio. Devuelve true si borró algo.
   */
  async borrar(url: string): Promise<boolean> {
    if (!url.startsWith(PREFIJO_URL)) return false;
    const nombre = path.basename(url.slice(PREFIJO_URL.length));
    if (!NOMBRE_VALIDO.test(nombre) || url.slice(PREFIJO_URL.length) !== nombre) return false;
    try {
      await unlink(path.join(directorioProductos(), nombre));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  },
};
