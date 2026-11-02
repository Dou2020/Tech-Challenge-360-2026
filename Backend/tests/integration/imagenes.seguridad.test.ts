import { randomUUID } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo } from '../helpers/auth.js';

/*
 * Complementa imagenes.test.ts: tipo real frente a Content-Type declarado, campos multipart,
 * límites de multer, cabeceras y rangos de /api/imagenes, archivos ocultos y huérfanos.
 */

const app = createApp();

type Http = Awaited<ReturnType<typeof clienteComo>>['http'];
let admin: Http;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('datos-de-prueba-0123456789'),
]);

beforeAll(async () => {
  await connectRedis();
  ({ http: admin } = await clienteComo(app, 'admin'));
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

async function crearProducto(): Promise<number> {
  const s = randomUUID().slice(0, 8).toUpperCase();
  const respuesta = await admin.post('/api/productos').send({
    idCategoria: 1,
    nombre: `Producto imagen ${s}`,
    descripcion: 'Creado por imagenes.seguridad.test.ts',
    variantes: [{ sku: `SEG-${s}`, precio: '50.00', existenciaInicial: 0, valores: [] }],
  });
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
  return respuesta.body.idProducto as number;
}

const ruta = (id: number) => `/api/productos/${id}/imagenes/archivo`;
const directorioProductos = () => path.join(env.IMAGENES_DIR, 'productos');
const archivosEnDisco = () => readdirSync(directorioProductos()).sort();

/** Sube un PNG y devuelve su URL pública. */
async function subirPng(): Promise<string> {
  const id = await crearProducto();
  const respuesta = await admin.post(ruta(id)).attach('imagen', PNG, 'foto.png');
  expect(respuesta.status).toBe(201);
  return respuesta.body.imagenes[0].url as string;
}

describe('tipo real frente al Content-Type declarado', () => {
  it('bytes de PNG con Content-Type text/plain y extensión .txt → 201 como PNG', async () => {
    // Arrange
    const id = await crearProducto();

    // Act
    const respuesta = await admin
      .post(ruta(id))
      .attach('imagen', PNG, { filename: 'nota.txt', contentType: 'text/plain' });

    // Assert
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.imagenes[0].url).toMatch(/\.png$/);
  });

  it('texto con Content-Type image/png → 415 TIPO_ARCHIVO_NO_PERMITIDO', async () => {
    // Arrange
    const id = await crearProducto();

    // Act
    const respuesta = await admin.post(ruta(id)).attach('imagen', Buffer.from('<?php echo 1; ?>'), {
      filename: 'foto.png',
      contentType: 'image/png',
    });

    // Assert
    expect(respuesta.status).toBe(415);
    expect(respuesta.body.error.code).toBe('TIPO_ARCHIVO_NO_PERMITIDO');
  });
});

describe('campos multipart inválidos', () => {
  it.each([
    ['orden', 'abc'],
    ['orden', '-1'],
    ['orden', '1.5'],
    ['orden', '256'],
    ['esPrincipal', 'quizas'],
    ['esPrincipal', '1'],
  ])('%s = "%s" → 400 VALIDACION con el campo', async (campo, valor) => {
    // Arrange
    const id = await crearProducto();
    const antes = archivosEnDisco();

    // Act
    const respuesta = await admin
      .post(ruta(id))
      .attach('imagen', PNG, 'foto.png')
      .field(campo, valor);

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    expect(respuesta.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: campo })]),
    );
    expect(archivosEnDisco()).toEqual(antes);
  });
});

describe('límites de multer', () => {
  it('dos archivos en el campo imagen → 400 VALIDACION', async () => {
    // Arrange
    const id = await crearProducto();

    // Act
    const respuesta = await admin
      .post(ruta(id))
      .attach('imagen', PNG, 'a.png')
      .attach('imagen', PNG, 'b.png');

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('más de 5 campos de texto → 400 VALIDACION', async () => {
    // Arrange
    const id = await crearProducto();
    let peticion = admin.post(ruta(id)).attach('imagen', PNG, 'a.png');
    for (let i = 0; i < 6; i++) peticion = peticion.field(`extra${i}`, 'x');

    // Act
    const respuesta = await peticion;

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('un campo de texto de más de 1 KB → 400 VALIDACION', async () => {
    // Arrange
    const id = await crearProducto();

    // Act
    const respuesta = await admin
      .post(ruta(id))
      .attach('imagen', PNG, 'a.png')
      .field('orden', '1'.repeat(2048));

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });
});

describe('si el SP falla no queda archivo huérfano', () => {
  it('producto inexistente → 404 y el directorio de imágenes queda igual', async () => {
    // Arrange
    const antes = archivosEnDisco();

    // Act
    const respuesta = await admin.post(ruta(2147483000)).attach('imagen', PNG, 'foto.png');

    // Assert
    expect(respuesta.status).toBe(404);
    expect(archivosEnDisco()).toEqual(antes);
  });
});

describe('GET y HEAD /api/imagenes', () => {
  it('trae Cache-Control inmutable, nosniff, CSP restrictiva y CORP cross-origin', async () => {
    // Arrange
    const url = await subirPng();

    // Act
    const respuesta = await request(app).get(url);

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
    expect(respuesta.headers['content-security-policy']).toBe("default-src 'none'");
    expect(respuesta.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('HEAD responde 200 con el tamaño y sin cuerpo', async () => {
    // Arrange
    const url = await subirPng();

    // Act
    const respuesta = await request(app).head(url);

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toContain('image/png');
    expect(Number(respuesta.headers['content-length'])).toBe(PNG.length);
    expect(respuesta.text ?? '').toBe('');
  });

  it('Range: bytes=0-7 → 206 con los 8 bytes de la firma PNG', async () => {
    // Arrange
    const url = await subirPng();

    // Act
    const respuesta = await request(app).get(url).set('Range', 'bytes=0-7');

    // Assert
    expect(respuesta.status).toBe(206);
    expect(respuesta.headers['content-range']).toBe(`bytes 0-7/${PNG.length}`);
    expect(respuesta.headers['accept-ranges']).toBe('bytes');
    expect(Buffer.from(respuesta.body as Buffer).equals(PNG.subarray(0, 8))).toBe(true);
  });

  it('un Range fuera del archivo → 416', async () => {
    // Arrange
    const url = await subirPng();

    // Act
    const respuesta = await request(app).get(url).set('Range', 'bytes=99999-');

    // Assert
    expect(respuesta.status).toBe(416);
    expect(respuesta.headers['content-type']).toMatch(/^application\/json/);
    expect(respuesta.headers['cache-control'] ?? '').not.toMatch(/immutable/);
    expect(respuesta.body.error.code).toBe('RANGO_NO_SATISFACIBLE');
  });

  it('un archivo oculto que sí existe en disco no se sirve (404 JSON)', async () => {
    // Arrange
    await subirPng();
    writeFileSync(path.join(directorioProductos(), '.oculto.png'), PNG);

    // Act
    const respuesta = await request(app).get('/api/imagenes/productos/.oculto.png');

    // Assert
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });

  it.each([
    '/api/imagenes/productos/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
    '/api/imagenes/productos/%2e%2e%5c%2e%2e%5cpackage.json',
    '/api/imagenes/productos/%252e%252e%252fpackage.json',
    '/api/imagenes/productos/foto.png%00.txt',
  ])('el recorrido de directorios codificado %s → 404', async (rutaPeligrosa) => {
    // Act
    const respuesta = await request(app).get(rutaPeligrosa);

    // Assert
    expect([400, 404]).toContain(respuesta.status);
    expect(respuesta.text).not.toContain('root:');
    expect(respuesta.text).not.toContain('"name"');
  });
});
