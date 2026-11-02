import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const directorio = vi.hoisted(() => ({ valor: '' }));
vi.mock('../../../../src/config/env.js', () => ({
  env: {
    get IMAGENES_DIR() {
      return directorio.valor;
    },
  },
}));

import { detectarTipo, imagenes } from '../../../../src/shared/almacenamiento/imagenes.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);

beforeAll(async () => {
  directorio.valor = await mkdtemp(path.join(tmpdir(), 'shopcart-unit-img-'));
});

afterAll(async () => {
  await rm(directorio.valor, { recursive: true, force: true });
});

describe('detectarTipo', () => {
  it.each([
    ['PNG', PNG, 'png'],
    ['JPEG', JPG, 'jpg'],
    ['WebP', WEBP, 'webp'],
  ])('reconoce %s por sus bytes mágicos', (_nombre, buffer, esperado) => {
    // Act & Assert
    expect(detectarTipo(buffer)).toBe(esperado);
  });

  it.each([
    ['texto con extensión de imagen', Buffer.from('esto no es una imagen')],
    ['GIF', Buffer.from('GIF89a......')],
    [
      'RIFF que no es WebP (WAV)',
      Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]),
    ],
    ['buffer vacío', Buffer.alloc(0)],
    ['PNG truncado', PNG.subarray(0, 4)],
  ])('rechaza %s', (_nombre, buffer) => {
    // Act & Assert
    expect(detectarTipo(buffer)).toBeUndefined();
  });
});

describe('imagenes.guardar', () => {
  it('escribe el archivo con nombre UUID y devuelve la URL relativa', async () => {
    // Act
    const url = await imagenes.guardar(PNG);

    // Assert
    expect(url).toMatch(
      /^\/api\/imagenes\/productos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );
    expect(existsSync(path.join(directorio.valor, 'productos', path.basename(url!)))).toBe(true);
  });

  it('no deja archivos temporales', async () => {
    // Arrange
    await imagenes.guardar(JPG);

    // Act
    const archivos = await readdir(path.join(directorio.valor, 'productos'));

    // Assert
    expect(archivos.filter((nombre) => nombre.endsWith('.tmp'))).toEqual([]);
  });

  it('con un tipo no permitido devuelve undefined y no escribe', async () => {
    // Arrange
    const antes = await readdir(path.join(directorio.valor, 'productos'));

    // Act
    const url = await imagenes.guardar(Buffer.from('texto'));

    // Assert
    expect(url).toBeUndefined();
    expect(await readdir(path.join(directorio.valor, 'productos'))).toEqual(antes);
  });
});

describe('imagenes.borrar', () => {
  it('borra el archivo de una URL propia', async () => {
    // Arrange
    const url = (await imagenes.guardar(WEBP))!;

    // Act
    const borrado = await imagenes.borrar(url);

    // Assert
    expect(borrado).toBe(true);
    expect(existsSync(path.join(directorio.valor, 'productos', path.basename(url)))).toBe(false);
  });

  it('un archivo que ya no existe no es un error', async () => {
    // Act
    const borrado = await imagenes.borrar(
      '/api/imagenes/productos/0f8fad5b-d9cb-469f-a165-70867728950e.png',
    );

    // Assert
    expect(borrado).toBe(false);
  });

  it.each([
    'https://cdn.externo.gt/imagen.png',
    '/api/imagenes/productos/../../etc/passwd',
    '/api/imagenes/productos/../productos/0f8fad5b-d9cb-469f-a165-70867728950e.png',
    '/api/imagenes/productos/nombre-no-uuid.png',
    '/api/imagenes/otro/0f8fad5b-d9cb-469f-a165-70867728950e.png',
    '/api/imagenes/productos/0f8fad5b-d9cb-469f-a165-70867728950e.exe',
  ])('ignora la URL %s sin tocar el disco', async (url) => {
    // Arrange
    await mkdir(path.join(directorio.valor, 'productos'), { recursive: true });
    const intacto = path.join(directorio.valor, 'productos', 'centinela.txt');
    await writeFile(intacto, 'x');

    // Act
    const borrado = await imagenes.borrar(url);

    // Assert
    expect(borrado).toBe(false);
    expect(existsSync(intacto)).toBe(true);
  });
});
