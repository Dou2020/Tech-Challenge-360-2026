import { existsSync } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo, clienteHttp } from '../helpers/auth.js';

/*
 * Subida de imágenes de producto al disco del servidor y descarga por /api/imagenes.
 * IMAGENES_DIR es un directorio temporal (globalSetup) e IMAGENES_MAX_MB vale 1.
 */

const app = createApp();

type Http = Awaited<ReturnType<typeof clienteComo>>['http'];
let admin: Http;
const creados: number[] = [];

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('datos-de-prueba'),
]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 datos')]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

beforeAll(async () => {
  await connectRedis();
  ({ http: admin } = await clienteComo(app, 'admin'));
});

afterAll(async () => {
  // Los productos creados aquí se eliminan: el listado público de catalogo.test.ts pagina de a 100.
  for (const id of creados) await admin.delete(`/api/productos/${id}`);
  await Promise.all([closePool(), closeRedis()]);
});

/** Producto sin existencia (se puede eliminar) para colgarle imágenes. */
async function crearProducto(): Promise<number> {
  const s = Math.random().toString(36).slice(2, 10).toUpperCase();
  const respuesta = await admin.post('/api/productos').send({
    idCategoria: 1,
    nombre: `Producto con imagen ${s}`,
    descripcion: 'Creado por imagenes.test.ts',
    variantes: [{ sku: `IMG-${s}`, precio: '50.00', existenciaInicial: 0, valores: [] }],
  });
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
  creados.push(respuesta.body.idProducto as number);
  return respuesta.body.idProducto as number;
}

const subir = (http: Http, id: number, archivo: Buffer, nombre = 'foto.png') =>
  http.post(`/api/productos/${id}/imagenes/archivo`).attach('imagen', archivo, nombre);

const archivoEnDisco = (url: string) =>
  path.join(env.IMAGENES_DIR, 'productos', path.basename(url));

describe('POST /api/productos/:id/imagenes/archivo', () => {
  it.each([
    ['PNG', PNG, 'png', 'image/png'],
    ['WebP', WEBP, 'webp', 'image/webp'],
    ['JPEG', JPG, 'jpg', 'image/jpeg'],
  ])(
    'un %s válido responde 201 y se descarga por /api/imagenes',
    async (_n, archivo, ext, mime) => {
      // Arrange
      const id = await crearProducto();

      // Act
      const respuesta = await subir(admin, id, archivo, `foto.${ext}`)
        .field('orden', '2')
        .field('esPrincipal', 'true');
      const url = respuesta.body.imagenes?.[0]?.url as string;
      const descarga = await request(app).get(url);

      // Assert
      expect(respuesta.status).toBe(201);
      expect(respuesta.body.imagenes).toEqual([
        expect.objectContaining({ orden: 2, esPrincipal: true }),
      ]);
      expect(url).toMatch(new RegExp(`^/api/imagenes/productos/[0-9a-f-]{36}\\.${ext}$`));
      expect(descarga.status).toBe(200);
      expect(descarga.headers['content-type']).toContain(mime);
      expect(Buffer.from(descarga.body as Buffer).equals(archivo)).toBe(true);
      expect(descarga.headers['cache-control']).toContain('immutable');
      expect(descarga.headers['content-security-policy']).toBe("default-src 'none'");
      expect(descarga.headers['x-content-type-options']).toBe('nosniff');
    },
  );

  it('sin orden ni esPrincipal usa los valores por defecto (la primera queda principal)', async () => {
    // Arrange
    const id = await crearProducto();

    // Act
    const respuesta = await subir(admin, id, PNG);

    // Assert
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.imagenes[0]).toMatchObject({ orden: 0, esPrincipal: true });
  });

  it('un archivo .png que en realidad es texto responde 415 y no deja nada en disco', async () => {
    // Arrange
    const id = await crearProducto();

    // Act
    const respuesta = await subir(admin, id, Buffer.from('<script>alert(1)</script>'), 'x.png');

    // Assert
    expect(respuesta.status).toBe(415);
    expect(respuesta.body.error.code).toBe('TIPO_ARCHIVO_NO_PERMITIDO');
    const producto = await admin.get(`/api/productos/${id}`);
    expect(producto.body.imagenes).toEqual([]);
  });

  it('un archivo por encima del límite responde 413 ARCHIVO_DEMASIADO_GRANDE', async () => {
    // Arrange
    const id = await crearProducto();
    const grande = Buffer.concat([PNG, Buffer.alloc(env.IMAGENES_MAX_MB * 1024 * 1024)]);

    // Act
    const respuesta = await subir(admin, id, grande);

    // Assert
    expect(respuesta.status).toBe(413);
    expect(respuesta.body.error.code).toBe('ARCHIVO_DEMASIADO_GRANDE');
  });

  it('sin archivo responde 400 VALIDACION', async () => {
    // Arrange
    const id = await crearProducto();

    // Act
    const respuesta = await admin.post(`/api/productos/${id}/imagenes/archivo`).field('orden', '1');

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('un campo con otro nombre responde 400 VALIDACION', async () => {
    // Arrange
    const id = await crearProducto();

    // Act
    const respuesta = await admin
      .post(`/api/productos/${id}/imagenes/archivo`)
      .attach('archivo', PNG, 'x.png');

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('un orden inválido responde 400 VALIDACION con el campo', async () => {
    // Arrange
    const id = await crearProducto();

    // Act
    const respuesta = await subir(admin, id, PNG).field('orden', '999');

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'orden' })]),
    );
  });

  it('un producto inexistente responde 404 y no deja el archivo huérfano', async () => {
    // Act
    const respuesta = await subir(admin, 2147483000, PNG);

    // Assert
    expect(respuesta.status).toBe(404);
  });

  it('Cliente y Operador reciben 403 y sin token 401', async () => {
    // Arrange
    const id = await crearProducto();
    const cliente = (await clienteComo(app, 'cliente')).http;
    const operador = (await clienteComo(app, 'operador')).http;

    // Act
    const comoCliente = await subir(cliente, id, PNG);
    const comoOperador = await subir(operador, id, PNG);
    const sinToken = await request(app)
      .post(`/api/productos/${id}/imagenes/archivo`)
      .attach('imagen', PNG, 'x.png');

    // Assert
    expect(comoCliente.status).toBe(403);
    expect(comoOperador.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('borrado de archivos', () => {
  it('eliminar la imagen borra el archivo del disco', async () => {
    // Arrange
    const id = await crearProducto();
    const subida = await subir(admin, id, PNG);
    const imagen = subida.body.imagenes[0] as { idProductoImagen: number; url: string };
    expect(existsSync(archivoEnDisco(imagen.url))).toBe(true);

    // Act
    const respuesta = await admin.delete(
      `/api/productos/${id}/imagenes/${imagen.idProductoImagen}`,
    );

    // Assert
    expect(respuesta.status).toBe(204);
    expect(existsSync(archivoEnDisco(imagen.url))).toBe(false);
    expect((await request(app).get(imagen.url)).status).toBe(404);
  });

  it('eliminar el producto borra los archivos de todas sus imágenes', async () => {
    // Arrange
    const id = await crearProducto();
    const a = (await subir(admin, id, PNG)).body.imagenes[0].url as string;
    const b = (await subir(admin, id, JPG)).body.imagenes.map(
      (i: { url: string }) => i.url,
    ) as string[];
    expect(b).toHaveLength(2);

    // Act
    const respuesta = await admin.delete(`/api/productos/${id}`);

    // Assert
    expect(respuesta.status).toBe(204);
    for (const url of b) expect(existsSync(archivoEnDisco(url))).toBe(false);
    expect(existsSync(archivoEnDisco(a))).toBe(false);
  });
});

describe('GET /api/imagenes', () => {
  it('un archivo que no existe responde 404 JSON', async () => {
    // Act
    const respuesta = await request(app).get(
      '/api/imagenes/productos/00000000-0000-0000-0000-000000000000.png',
    );

    // Assert
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });

  it.each([
    '/api/imagenes/../x',
    '/api/imagenes/productos/../../package.json',
    '/api/imagenes/%2e%2e/%2e%2e/package.json',
    '/api/imagenes/productos/%2e%2e%2f%2e%2e%2fpackage.json',
    '/api/imagenes/productos/',
    '/api/imagenes/',
  ])('%s no sirve nada fuera del directorio (404)', async (ruta) => {
    // Act
    const respuesta = await request(app).get(ruta);

    // Assert
    expect(respuesta.status).toBe(404);
    expect(respuesta.headers['content-type']).toContain('application/json');
  });

  it('no sirve archivos ocultos', async () => {
    // Act
    const respuesta = await request(app).get('/api/imagenes/productos/.oculto.png.tmp');

    // Assert
    expect(respuesta.status).toBe(404);
  });

  it('es público: no necesita token', async () => {
    // Arrange
    const id = await crearProducto();
    const url = (await subir(admin, id, PNG)).body.imagenes[0].url as string;

    // Act
    const respuesta = await clienteHttp(app, 'token-invalido').get(url);
    const sinToken = await request(app).get(url);

    // Assert
    expect(respuesta.status).toBe(200);
    expect(sinToken.status).toBe(200);
  });
});

describe('PUT /api/productos/:id/imagenes/orden', () => {
  it('reordena las imágenes y la primera queda como principal', async () => {
    // Arrange
    const id = await crearProducto();
    await subir(admin, id, PNG);
    await subir(admin, id, WEBP);
    const detalle = await subir(admin, id, JPG);
    const ids = (detalle.body.imagenes as { idProductoImagen: number }[]).map(
      (i) => i.idProductoImagen,
    );
    const nuevoOrden = [ids[2], ids[0], ids[1]];

    // Act
    const respuesta = await admin.put(`/api/productos/${id}/imagenes/orden`).send({
      imagenes: nuevoOrden,
    });

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(
      respuesta.body.imagenes.map((i: { idProductoImagen: number }) => i.idProductoImagen),
    ).toEqual(nuevoOrden);
    expect(respuesta.body.imagenes[0]).toMatchObject({ orden: 0, esPrincipal: true });
    expect(respuesta.body.imagenes[1]).toMatchObject({ orden: 1, esPrincipal: false });
  });
});

type ImagenApi = { idProductoImagen: number; orden: number; esPrincipal: boolean; url: string };

/** Producto con n imágenes (PNG/WebP/JPG por turnos); devuelve sus ids en el orden de subida. */
async function productoConImagenes(n: number): Promise<{ id: number; ids: number[] }> {
  const id = await crearProducto();
  const archivos = [PNG, WEBP, JPG];
  let ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = await subir(admin, id, archivos[i % 3]!);
    ids = (r.body.imagenes as ImagenApi[]).map((x) => x.idProductoImagen);
  }
  return { id, ids };
}

const ordenar = (http: Http, id: number, imagenes: unknown) =>
  http.put(`/api/productos/${id}/imagenes/orden`).send({ imagenes });

const idsDe = async (id: number): Promise<number[]> => {
  const r = await admin.get(`/api/productos/${id}`);
  return (r.body.imagenes as ImagenApi[]).map((x) => x.idProductoImagen);
};

const bitacoraImagenes = async (idsImagen: number[]) => {
  const entradas: { idRegistro: number; accion: string }[] = [];
  for (const idRegistro of idsImagen) {
    const r = await admin
      .get('/api/bitacora')
      .query({ modulo: 'Catalogo', entidad: 'ProductoImagen', idRegistro, accion: 'MODIFICAR' });
    entradas.push(...(r.body.items as { idRegistro: number; accion: string }[]));
  }
  return entradas;
};

describe('PUT /api/productos/:id/imagenes/orden (casos de error y efectos)', () => {
  it.each([
    ['faltante', (ids: number[], _aj: number) => ids.slice(0, 2)],
    ['sobrante (de otro producto)', (ids: number[], aj: number) => [...ids, aj]],
    [
      'ajena (sustituida por una de otro producto)',
      (ids: number[], aj: number) => [ids[0]!, ids[1]!, aj],
    ],
  ])('una lista con imagen %s → 400 VALIDACION y el orden no cambia', async (_n, armar) => {
    // Arrange
    const { id, ids } = await productoConImagenes(3);
    const otro = await productoConImagenes(1);

    // Act
    const respuesta = await ordenar(admin, id, armar(ids, otro.ids[0]!));

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    expect(await idsDe(id)).toEqual(ids);
  });

  it('una lista con un id repetido → 400 VALIDACION en details[].field imagenes y no cambia el orden', async () => {
    // Arrange
    const { id, ids } = await productoConImagenes(3);

    // Act
    const respuesta = await ordenar(admin, id, [ids[0], ids[0], ids[1]]);

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    expect(respuesta.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'imagenes' })]),
    );
    expect(await idsDe(id)).toEqual(ids);
  });

  it('producto inexistente → 404 NO_ENCONTRADO', async () => {
    // Act
    const respuesta = await ordenar(admin, 2147483000, [1]);

    // Assert
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });

  it('sin token → 401', async () => {
    // Arrange
    const { id, ids } = await productoConImagenes(2);

    // Act
    const respuesta = await request(app)
      .put(`/api/productos/${id}/imagenes/orden`)
      .send({ imagenes: [...ids].reverse() });

    // Assert
    expect(respuesta.status).toBe(401);
  });

  it.each(['operador', 'cliente'] as const)('como %s → 403 y el orden no cambia', async (rol) => {
    // Arrange
    const { id, ids } = await productoConImagenes(2);
    const { http } = await clienteComo(app, rol);

    // Act
    const respuesta = await ordenar(http, id, [...ids].reverse());

    // Assert
    expect(respuesta.status).toBe(403);
    expect(await idsDe(id)).toEqual(ids);
  });

  it('tras ordenar, el detalle y el listado públicos reflejan el nuevo orden y la nueva principal', async () => {
    // Arrange
    const { id, ids } = await productoConImagenes(3);
    const nuevo = [ids[2]!, ids[0]!, ids[1]!];
    const detalleAdmin = await admin.get(`/api/productos/${id}`);
    const nombre = detalleAdmin.body.nombre as string;
    const urlNueva = (detalleAdmin.body.imagenes as ImagenApi[]).find(
      (i) => i.idProductoImagen === nuevo[0],
    )!.url;
    expect((await ordenar(admin, id, nuevo)).status).toBe(200);

    // Act
    const detalle = await request(app).get(`/api/catalogo/productos/${id}`);
    const listado = await request(app).get('/api/catalogo/productos').query({ q: nombre });

    // Assert
    expect(detalle.status).toBe(200);
    const imagenes = detalle.body.imagenes as ImagenApi[];
    expect(imagenes.map((i) => i.idProductoImagen)).toEqual(nuevo);
    expect(imagenes[0]).toMatchObject({ esPrincipal: true });
    const item = (listado.body.items as { idProducto: number; imagenPrincipal: string }[]).find(
      (p) => p.idProducto === id,
    );
    expect(item?.imagenPrincipal).toBe(urlNueva);
  });

  it('escribe una bitácora MODIFICAR por cada imagen cuyo orden o principal cambió', async () => {
    // Arrange
    const { id, ids } = await productoConImagenes(3);
    // [a, b, c] -> [a, c, b]: la principal (a) no cambia; solo b y c.
    const nuevo = [ids[0]!, ids[2]!, ids[1]!];

    // Act
    const respuesta = await ordenar(admin, id, nuevo);

    // Assert
    expect(respuesta.status).toBe(200);
    const entradas = await bitacoraImagenes(ids);
    expect(entradas.map((e) => e.idRegistro).sort()).toEqual([ids[1], ids[2]].sort());
    expect(entradas.every((e) => e.accion === 'MODIFICAR')).toBe(true);
  });

  it('reenviar el mismo orden → 200 sin bitácora nueva', async () => {
    // Arrange
    const { id, ids } = await productoConImagenes(3);
    await ordenar(admin, id, [ids[2]!, ids[0]!, ids[1]!]);
    const antes = (await bitacoraImagenes(ids)).length;
    const actual = await idsDe(id);

    // Act
    const respuesta = await ordenar(admin, id, actual);

    // Assert
    expect(respuesta.status).toBe(200);
    expect((await bitacoraImagenes(ids)).length).toBe(antes);
  });
});

describe('orden por defecto y principal al quitar', () => {
  it('agregar sin orden a un producto con imágenes → queda al final', async () => {
    // Arrange
    const { id, ids } = await productoConImagenes(2);

    // Act
    const respuesta = await subir(admin, id, JPG);

    // Assert
    expect(respuesta.status).toBe(201);
    const imagenes = respuesta.body.imagenes as ImagenApi[];
    expect(imagenes).toHaveLength(3);
    expect(imagenes.slice(0, 2).map((i) => i.idProductoImagen)).toEqual(ids);
    expect(imagenes[2]).toMatchObject({ orden: 2, esPrincipal: false });
  });

  it('agregar por URL sin orden → queda al final', async () => {
    // Arrange
    const { id, ids } = await productoConImagenes(2);

    // Act
    const respuesta = await admin
      .post(`/api/productos/${id}/imagenes`)
      .send({ url: 'https://placehold.co/600x600?text=Z' });

    // Assert
    expect(respuesta.status).toBe(201);
    const imagenes = respuesta.body.imagenes as ImagenApi[];
    expect(imagenes.slice(0, 2).map((i) => i.idProductoImagen)).toEqual(ids);
    expect(imagenes[2]).toMatchObject({ orden: 2, esPrincipal: false });
  });

  it('quitar la principal tras reordenar promueve a la que estaba en la posición 1', async () => {
    // Arrange
    const { id, ids } = await productoConImagenes(3);
    const nuevo = [ids[2]!, ids[0]!, ids[1]!];
    await ordenar(admin, id, nuevo);

    // Act
    const respuesta = await admin.delete(`/api/productos/${id}/imagenes/${nuevo[0]}`);

    // Assert
    expect(respuesta.status).toBe(204);
    const detalle = await admin.get(`/api/productos/${id}`);
    const imagenes = detalle.body.imagenes as ImagenApi[];
    expect(imagenes.map((i) => i.idProductoImagen)).toEqual([nuevo[1], nuevo[2]]);
    expect(imagenes[0]).toMatchObject({ esPrincipal: true });
    expect(imagenes[1]).toMatchObject({ esPrincipal: false });
  });
});
