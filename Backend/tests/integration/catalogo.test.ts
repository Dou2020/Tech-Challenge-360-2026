import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { cache } from '../../src/shared/cache/cache.js';
import { clienteComo } from '../helpers/auth.js';

/*
 * Catálogo público y gestión del catálogo (RF-02). La base y Redis se comparten con los demás
 * archivos de integración: los productos, SKU y categorías de este archivo llevan un sufijo
 * aleatorio y no se depende de conteos exactos de la semilla.
 *
 * Semilla: producto 5 "Tenis urbanos" (variante 13 CAL-TEN-NEG-41 inactiva), producto 7
 * "Bufanda de lana" inactivo, categoría 1 "Camisetas" con productos.
 */

const app = createApp();

type Http = Awaited<ReturnType<typeof clienteComo>>['http'];
let admin: Http;

/** IDValorAtributo de la semilla por atributo y valor: valores.Talla.M, valores.Color.Negro. */
const valores: Record<string, Record<string, number>> = {};

const sufijo = () => randomUUID().slice(0, 8).toUpperCase();

interface VarianteRespuesta {
  idVariante: number;
  sku: string;
  precio: string;
  existenciaFisica: number;
  existenciaDisponible: number;
  valores: { idAtributo: number; atributo: string; idValorAtributo: number; valor: string }[];
}

/** Crea un producto en Camisetas con dos variantes (Talla M y L, Color Negro). */
async function crearProducto(existencias: [number, number] = [5, 3]) {
  const s = sufijo();
  const respuesta = await admin.post('/api/productos').send({
    idCategoria: 1,
    nombre: `Sudadero de prueba ${s}`,
    descripcion: 'Creado por catalogo.test.ts',
    variantes: [
      {
        sku: `PRU-${s}-M`,
        precio: '199.90',
        existenciaInicial: existencias[0],
        valores: [valores.Talla!.M!, valores.Color!.Negro!],
      },
      {
        sku: `PRU-${s}-L`,
        precio: '209.90',
        existenciaInicial: existencias[1],
        valores: [valores.Talla!.L!, valores.Color!.Negro!],
      },
    ],
  });
  return { respuesta, sufijo: s };
}

beforeAll(async () => {
  await connectRedis();
  ({ http: admin } = await clienteComo(app, 'admin'));

  const atributos = await admin.get('/api/atributos');
  expect(atributos.status).toBe(200);
  for (const atributo of atributos.body as {
    nombre: string;
    valores: { idValorAtributo: number; valor: string }[];
  }[]) {
    valores[atributo.nombre] = Object.fromEntries(
      atributo.valores.map((valor) => [valor.valor, valor.idValorAtributo]),
    );
  }
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

describe('GET /api/catalogo/productos', () => {
  it('lista solo productos visibles: no aparece el producto inactivo', async () => {
    const respuesta = await request(app).get('/api/catalogo/productos?pageSize=100');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ page: 1, pageSize: 100 });
    const ids = (respuesta.body.items as { idProducto: number }[]).map((p) => p.idProducto);
    expect(ids).toContain(1);
    expect(ids).not.toContain(7);
    // La búsqueda trae existencia (disponible): nunca sale de la caché.
    expect(respuesta.headers['x-cache']).toBeUndefined();
  });

  it('pagina y ordena por precio ascendente', async () => {
    const pagina1 = await request(app).get('/api/catalogo/productos?pageSize=2&sort=precio:asc');
    const pagina2 = await request(app).get(
      '/api/catalogo/productos?pageSize=2&page=2&sort=precio:asc',
    );

    expect(pagina1.status).toBe(200);
    expect(pagina1.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(pagina1.body.items).toHaveLength(2);
    expect(pagina1.body.total).toBeGreaterThanOrEqual(6);
    const precios = [...pagina1.body.items, ...pagina2.body.items].map(
      (p: { precioMinimo: string }) => Number(p.precioMinimo),
    );
    expect(precios).toEqual([...precios].sort((a, b) => a - b));
    expect(pagina1.body.items[0].precioMinimo).toMatch(/^\d+\.\d{2}$/);
  });

  it('filtra por texto y por categoría', async () => {
    const respuesta = await request(app).get('/api/catalogo/productos?q=jeans&idCategoria=2');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items.length).toBeGreaterThanOrEqual(1);
    for (const item of respuesta.body.items as { idCategoria: number }[]) {
      expect(item.idCategoria).toBe(2);
    }
  });

  it.each([
    ['sort=existencia:asc', 'sort'],
    ['sort=precio', 'sort'],
    ['disponible=si', 'disponible'],
    ['precioMin=100&precioMax=50', 'precioMax'],
    ['pageSize=101', 'pageSize'],
  ])('%s → 400 VALIDACION', async (query, campo) => {
    const respuesta = await request(app).get(`/api/catalogo/productos?${query}`);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    expect(respuesta.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: campo })]),
    );
  });
});

describe('GET /api/catalogo/productos/:id', () => {
  it('trae solo variantes activas con existencia disponible, valores e imágenes', async () => {
    const respuesta = await request(app).get('/api/catalogo/productos/5');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['x-cache']).toBeUndefined();
    expect(respuesta.body).toMatchObject({
      idProducto: 5,
      nombre: 'Tenis urbanos',
      categoria: 'Calzado',
      precioMinimo: expect.stringMatching(/^\d+\.\d{2}$/),
    });
    const variantes = respuesta.body.variantes as VarianteRespuesta[];
    const skus = variantes.map((v) => v.sku);
    expect(skus).toContain('CAL-TEN-BLA-40');
    expect(skus).not.toContain('CAL-TEN-NEG-41'); // variante 13, inactiva
    expect(variantes.map((v) => v.idVariante)).not.toContain(13);
    for (const variante of variantes) {
      expect(variante.existenciaDisponible).toEqual(expect.any(Number));
      expect(variante.precio).toMatch(/^\d+\.\d{2}$/);
      expect(variante.valores.map((v) => v.atributo).sort()).toEqual(['Color', 'Talla']);
      // El catálogo público no expone datos internos de inventario.
      expect(variante).not.toHaveProperty('existenciaFisica');
    }
    expect(respuesta.body.imagenes[0]).toMatchObject({ esPrincipal: true });
  });

  it('un producto inactivo responde 404 NO_ENCONTRADO', async () => {
    const respuesta = await request(app).get('/api/catalogo/productos/7');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });

  it('un id que no es entero positivo responde 400', async () => {
    const respuesta = await request(app).get('/api/catalogo/productos/abc');
    expect(respuesta.status).toBe(400);
  });
});

describe('Caché del catálogo público', () => {
  it('categorías: MISS, HIT y de nuevo MISS tras crear y tras actualizar una categoría', async () => {
    await cache.invalidar('catalogo');
    const leer = () => request(app).get('/api/catalogo/categorias');

    const primera = await leer();
    expect(primera.status).toBe(200);
    expect(primera.headers['x-cache']).toBe('MISS');
    expect((await leer()).headers['x-cache']).toBe('HIT');

    const nombre = `Categoría de prueba ${sufijo()}`;
    const creada = await admin.post('/api/categorias').send({ nombre });
    expect(creada.status).toBe(201);

    const trasCrear = await leer();
    expect(trasCrear.headers['x-cache']).toBe('MISS');
    const nombres = (trasCrear.body as { nombre: string }[]).map((c) => c.nombre);
    expect(nombres).toContain(nombre);
    expect((await leer()).headers['x-cache']).toBe('HIT');

    const renombrada = `${nombre} (renombrada)`;
    const actualizada = await admin
      .put(`/api/categorias/${creada.body.idCategoria}`)
      .send({ nombre: renombrada, descripcion: 'Actualizada' });
    expect(actualizada.status).toBe(200);

    const trasActualizar = await leer();
    expect(trasActualizar.headers['x-cache']).toBe('MISS');
    expect(trasActualizar.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idCategoria: creada.body.idCategoria,
          nombre: renombrada,
          descripcion: 'Actualizada',
        }),
      ]),
    );
  });

  it('métodos de envío: costo como string y X-Cache', async () => {
    await cache.invalidar('catalogo');

    const primera = await request(app).get('/api/metodos-envio');
    const segunda = await request(app).get('/api/metodos-envio');

    expect(primera.status).toBe(200);
    expect(primera.headers['x-cache']).toBe('MISS');
    expect(segunda.headers['x-cache']).toBe('HIT');
    expect(primera.body.length).toBeGreaterThan(0);
    expect(primera.body[0]).toEqual({
      idMetodoEnvio: expect.any(Number),
      nombre: expect.any(String),
      costo: expect.stringMatching(/^\d+\.\d{2}$/),
      diasEstimados: expect.any(Number),
      requiereSucursal: expect.any(Boolean),
    });
    expect(segunda.body).toEqual(primera.body);
  });
});

describe('Acceso a la gestión del catálogo', () => {
  it('sin token → 401 NO_AUTENTICADO', async () => {
    for (const ruta of ['/api/productos', '/api/categorias', '/api/atributos']) {
      const respuesta = await request(app).get(ruta);
      expect(respuesta.status, ruta).toBe(401);
      expect(respuesta.body.error.code).toBe('NO_AUTENTICADO');
    }
  });

  it('Cliente y Operador → 403 PROHIBIDO', async () => {
    const { http: cliente } = await clienteComo(app, 'cliente');
    const { http: operador } = await clienteComo(app, 'operador');

    const respuestas = await Promise.all([
      cliente.get('/api/productos'),
      cliente.post('/api/categorias').send({ nombre: 'No permitida' }),
      operador.patch('/api/variantes/1/precio').send({ precio: '1.00' }),
      operador.get('/api/atributos'),
    ]);
    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error.code).toBe('PROHIBIDO');
    }
  });

  it('el Administrador ve los inactivos en /api/productos', async () => {
    const respuesta = await admin.get('/api/productos?activo=false&pageSize=100');

    expect(respuesta.status).toBe(200);
    const items = respuesta.body.items as { idProducto: number; activo: boolean }[];
    expect(items.map((p) => p.idProducto)).toContain(7);
    expect(items.every((p) => !p.activo)).toBe(true);
  });
});

describe('Productos y variantes (Administrador)', () => {
  it('crea un producto con 2 variantes y su existencia aparece en el detalle público', async () => {
    const { respuesta, sufijo: s } = await crearProducto([5, 3]);

    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    expect(respuesta.body).toMatchObject({
      nombre: `Sudadero de prueba ${s}`,
      idCategoria: 1,
      activo: true,
      tieneVentas: false,
      // Tiene kardex de INVENTARIO_INICIAL: ya no se puede eliminar.
      puedeEliminarse: false,
      imagenes: [],
    });
    const variantes = respuesta.body.variantes as VarianteRespuesta[];
    expect(variantes.map((v) => [v.sku, v.precio, v.existenciaFisica])).toEqual([
      [`PRU-${s}-M`, '199.90', 5],
      [`PRU-${s}-L`, '209.90', 3],
    ]);
    expect(variantes[0]!.valores.map((v) => v.valor).sort()).toEqual(['M', 'Negro']);

    const publico = await request(app).get(`/api/catalogo/productos/${respuesta.body.idProducto}`);
    expect(publico.status).toBe(200);
    expect(publico.body).toMatchObject({
      precioMinimo: '199.90',
      precioMaximo: '209.90',
      disponible: true,
    });
    expect(
      (publico.body.variantes as VarianteRespuesta[]).map((v) => [v.sku, v.existenciaDisponible]),
    ).toEqual([
      [`PRU-${s}-M`, 5],
      [`PRU-${s}-L`, 3],
    ]);
  });

  it('una variante con dos valores del mismo atributo → 400 VALIDACION', async () => {
    const s = sufijo();
    const respuesta = await admin.post('/api/productos').send({
      idCategoria: 1,
      nombre: `Inválido ${s}`,
      variantes: [
        { sku: `PRU-${s}`, precio: '99.00', valores: [valores.Talla!.S!, valores.Talla!.M!] },
      ],
    });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('un SKU repetido → 409 DUPLICADO', async () => {
    const respuesta = await admin.post('/api/productos').send({
      idCategoria: 1,
      nombre: `Duplicado ${sufijo()}`,
      variantes: [{ sku: 'CAM-BAS-NEG-M', precio: '89.00' }],
    });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('DUPLICADO');
  });

  it('sin variantes o con un precio inválido → 400 con el detalle por campo', async () => {
    const respuesta = await admin.post('/api/productos').send({
      idCategoria: 1,
      nombre: 'Sin variantes',
      variantes: [],
    });
    const precio = await admin.post('/api/productos').send({
      idCategoria: 1,
      nombre: 'Precio inválido',
      variantes: [{ sku: `PRU-${sufijo()}`, precio: 10 }],
    });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.details).toEqual([expect.objectContaining({ field: 'variantes' })]);
    expect(precio.status).toBe(400);
    expect(precio.body.error.details).toEqual([
      expect.objectContaining({ field: 'variantes.0.precio' }),
    ]);
  });

  it('cambiar el precio responde el precio nuevo como string y se ve en el catálogo', async () => {
    const { respuesta: creado } = await crearProducto();
    const variante = (creado.body.variantes as VarianteRespuesta[])[0]!;

    const respuesta = await admin
      .patch(`/api/variantes/${variante.idVariante}/precio`)
      .send({ precio: '149' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ idVariante: variante.idVariante, precio: '149.00' });
    const publico = await request(app).get(`/api/catalogo/productos/${creado.body.idProducto}`);
    expect(publico.body.precioMinimo).toBe('149.00');
  });

  it('agrega, edita y desactiva variantes; la existencia no se toca', async () => {
    const { respuesta: creado, sufijo: s } = await crearProducto();
    const idProducto = creado.body.idProducto as number;

    const nueva = await admin.post(`/api/productos/${idProducto}/variantes`).send({
      sku: `PRU-${s}-S`,
      precio: '189.90',
      existenciaInicial: 2,
      valores: [valores.Talla!.S!, valores.Color!.Negro!],
    });
    expect(nueva.status, JSON.stringify(nueva.body)).toBe(201);
    expect(nueva.body).toMatchObject({ sku: `PRU-${s}-S`, existenciaFisica: 2, activo: true });

    // Misma combinación que la variante M → el SP la rechaza.
    const repetida = await admin.post(`/api/productos/${idProducto}/variantes`).send({
      sku: `PRU-${s}-M2`,
      precio: '189.90',
      valores: [valores.Talla!.M!, valores.Color!.Negro!],
    });
    expect(repetida.status).toBe(400);

    const editada = await admin
      .put(`/api/variantes/${nueva.body.idVariante}`)
      .send({ sku: `PRU-${s}-S-ED`, valores: [valores.Talla!.S!] });
    expect(editada.status).toBe(200);
    expect(editada.body).toMatchObject({ sku: `PRU-${s}-S-ED`, existenciaFisica: 2 });
    expect(editada.body.valores).toHaveLength(1);

    const inactiva = await admin
      .patch(`/api/variantes/${nueva.body.idVariante}/estado`)
      .send({ activo: false });
    expect(inactiva.status).toBe(200);
    expect(inactiva.body.activo).toBe(false);

    const publico = await request(app).get(`/api/catalogo/productos/${idProducto}`);
    expect((publico.body.variantes as VarianteRespuesta[]).map((v) => v.idVariante)).not.toContain(
      nueva.body.idVariante,
    );
  });

  it('desactivar un producto lo saca del catálogo público', async () => {
    const { respuesta: creado } = await crearProducto();
    const ruta = `/api/productos/${creado.body.idProducto}`;

    const respuesta = await admin.patch(`${ruta}/estado`).send({ activo: false });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.activo).toBe(false);
    const publico = await request(app).get(`/api/catalogo/productos/${creado.body.idProducto}`);
    expect(publico.status).toBe(404);
  });

  it('agrega y quita imágenes; la primera queda como principal', async () => {
    const { respuesta: creado } = await crearProducto();
    const ruta = `/api/productos/${creado.body.idProducto}/imagenes`;

    const agregada = await admin.post(ruta).send({ url: 'https://placehold.co/600x600?text=A' });
    expect(agregada.status).toBe(201);
    expect(agregada.body.imagenes).toEqual([
      expect.objectContaining({ orden: 0, esPrincipal: true }),
    ]);

    const sinProtocolo = await admin.post(ruta).send({ url: 'ftp://servidor/imagen.png' });
    expect(sinProtocolo.status).toBe(400);

    const idImagen = agregada.body.imagenes[0].idProductoImagen as number;
    expect((await admin.delete(`${ruta}/${idImagen}`)).status).toBe(204);
    expect((await admin.delete(`${ruta}/${idImagen}`)).status).toBe(404);
  });

  it('eliminar un producto con existencia (tiene kardex) → 409 EN_USO; sin existencia → 204', async () => {
    const { respuesta: conExistencia } = await crearProducto([5, 3]);
    const { respuesta: sinExistencia } = await crearProducto([0, 0]);

    const enUso = await admin.delete(`/api/productos/${conExistencia.body.idProducto}`);
    expect(enUso.status).toBe(409);
    expect(enUso.body.error.code).toBe('EN_USO');

    expect(sinExistencia.body.puedeEliminarse).toBe(true);
    const eliminado = await admin.delete(`/api/productos/${sinExistencia.body.idProducto}`);
    expect(eliminado.status).toBe(204);
    expect((await admin.get(`/api/productos/${sinExistencia.body.idProducto}`)).status).toBe(404);
  });
});

describe('Categorías (Administrador)', () => {
  it('eliminar una categoría con productos → 409 EN_USO', async () => {
    const respuesta = await admin.delete('/api/categorias/1');

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('EN_USO');
  });

  it('nombre repetido → 409 DUPLICADO; eliminar una categoría vacía → 204', async () => {
    const duplicada = await admin.post('/api/categorias').send({ nombre: 'Camisetas' });
    expect(duplicada.status).toBe(409);
    expect(duplicada.body.error.code).toBe('DUPLICADO');

    const creada = await admin.post('/api/categorias').send({ nombre: `Temporal ${sufijo()}` });
    expect(creada.status).toBe(201);
    expect(creada.body).toMatchObject({ activo: true, descripcion: null, cantidadProductos: 0 });

    const eliminada = await admin.delete(`/api/categorias/${creada.body.idCategoria}`);
    expect(eliminada.status).toBe(204);
    expect((await admin.get(`/api/categorias/${creada.body.idCategoria}`)).status).toBe(404);
  });

  it('desactivar una categoría oculta sus productos del catálogo público', async () => {
    const categoria = await admin.post('/api/categorias').send({ nombre: `Oculta ${sufijo()}` });
    const s = sufijo();
    const producto = await admin.post('/api/productos').send({
      idCategoria: categoria.body.idCategoria,
      nombre: `En categoría oculta ${s}`,
      variantes: [{ sku: `PRU-${s}`, precio: '50.00' }],
    });
    expect(producto.status).toBe(201);
    const rutaPublica = `/api/catalogo/productos/${producto.body.idProducto}`;
    expect((await request(app).get(rutaPublica)).status).toBe(200);

    const inactiva = await admin
      .patch(`/api/categorias/${categoria.body.idCategoria}/estado`)
      .send({ activo: false });

    expect(inactiva.status).toBe(200);
    expect(inactiva.body.activo).toBe(false);
    expect((await request(app).get(rutaPublica)).status).toBe(404);
  });

  it('lista paginada con filtro de texto y orden', async () => {
    const respuesta = await admin.get('/api/categorias?q=cal&sort=nombre:asc');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ nombre: 'Calzado' })]),
    );
  });
});

describe('Atributos (Administrador)', () => {
  it('crea un atributo y le agrega un valor; un valor repetido → 409 DUPLICADO', async () => {
    const creado = await admin.post('/api/atributos').send({ nombre: `Material ${sufijo()}` });
    expect(creado.status).toBe(201);
    expect(creado.body).toEqual({ idAtributo: expect.any(Number), nombre: expect.any(String) });

    const ruta = `/api/atributos/${creado.body.idAtributo}/valores`;
    const valor = await admin.post(ruta).send({ valor: 'Algodón' });
    expect(valor.status).toBe(201);
    expect(valor.body).toMatchObject({ idAtributo: creado.body.idAtributo, valor: 'Algodón' });

    const repetido = await admin.post(ruta).send({ valor: 'Algodón' });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.code).toBe('DUPLICADO');
  });
});
