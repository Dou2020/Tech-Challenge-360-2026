import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo } from '../helpers/auth.js';
import {
  agregarAlCarrito,
  crearSucursal,
  crearVariante,
  metodoEnvio,
  metodoRetiro,
  nuevoCliente,
  pagarRetiro,
  prepararRetiro,
  sucursalActiva,
  type ClientePrueba,
  type Http,
} from '../helpers/pedidos.js';

/*
 * Sucursales y retiro en sucursal. Semilla: sucursales 1 (Zona 10), 2 (Zona 1) y 3 (Mixco)
 * activas y 4 (Antigua) inactiva; método 3 "Recoger en sucursal". Las altas se hacen con
 * nombres únicos para no alterar la semilla.
 */

const app = createApp();
let admin: Http;
let operador: Http;
let idRetiro: number;
let idDomicilio: number;
let idSucursal: number;
let idInactiva: number;

const datos = (nombre: string) => ({
  nombre,
  telefono: '2222-3333',
  linea1: '5a. avenida 10-20, zona 1',
  municipio: 'Guatemala',
  departamento: 'Guatemala',
  codigoPostal: '01001',
  horario: 'Lun-Vie 9:00-17:00',
});

const nombreUnico = () => `Sucursal ${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  await connectRedis();
  ({ http: admin } = await clienteComo(app, 'admin'));
  ({ http: operador } = await clienteComo(app, 'operador'));
  [idRetiro, idDomicilio, idSucursal] = await Promise.all([
    metodoRetiro(app),
    metodoEnvio(app),
    sucursalActiva(app),
  ]);
  const lista = await admin.get('/api/sucursales').query({ activo: 'false' });
  idInactiva = (lista.body.items as { idSucursal: number }[])[0]!.idSucursal;
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

describe('Gestión de sucursales (Administrador)', () => {
  it('sin token → 401 y Operador → 403', async () => {
    // Act
    const sinToken = await request(app).get('/api/sucursales');
    const comoOperador = await operador.get('/api/sucursales');

    // Assert
    expect(sinToken.status).toBe(401);
    expect(comoOperador.status).toBe(403);
    expect(comoOperador.body.error.code).toBe('PROHIBIDO');
  });

  it('CRUD completo: crear 201, leer, actualizar, desactivar y eliminar 204', async () => {
    // Arrange
    const nombre = nombreUnico();

    // Act
    const creada = await admin.post('/api/sucursales').send(datos(nombre));
    const id = creada.body.idSucursal as number;
    const leida = await admin.get(`/api/sucursales/${id}`);
    const editada = await admin
      .put(`/api/sucursales/${id}`)
      .send({ ...datos(nombre), nombre: `${nombre} B`, horario: null });
    const inactiva = await admin.patch(`/api/sucursales/${id}/estado`).send({ activo: false });
    const eliminada = await admin.delete(`/api/sucursales/${id}`);
    const despues = await admin.get(`/api/sucursales/${id}`);

    // Assert
    expect(creada.status, JSON.stringify(creada.body)).toBe(201);
    expect(creada.body).toMatchObject({
      nombre,
      activo: true,
      cantidadPedidos: 0,
      linea2: null,
    });
    expect(leida.body.idSucursal).toBe(id);
    expect(editada.body).toMatchObject({ nombre: `${nombre} B`, horario: null });
    expect(inactiva.body.activo).toBe(false);
    expect(eliminada.status).toBe(204);
    expect(despues.status).toBe(404);
  });

  it('el listado pagina y filtra; un nombre repetido → 409 DUPLICADO', async () => {
    // Act
    const lista = await admin
      .get('/api/sucursales')
      .query({ q: 'Zona', page: 1, pageSize: 1, sort: 'nombre:desc' });
    const repetida = await admin.post('/api/sucursales').send(datos('Sucursal Zona 10'));

    // Assert
    expect(lista.status).toBe(200);
    expect(lista.body).toMatchObject({ page: 1, pageSize: 1 });
    expect(lista.body.total).toBeGreaterThanOrEqual(2);
    expect(lista.body.items).toHaveLength(1);
    expect(repetida.status).toBe(409);
    expect(repetida.body.error.code).toBe('DUPLICADO');
  });

  it('un cuerpo inválido → 400 y una sucursal con pedidos no se elimina (409 EN_USO)', async () => {
    // Arrange
    const sinNombre = { ...datos('x'), nombre: '' };
    const conPedidos = await admin.get('/api/sucursales').query({ sort: 'cantidadPedidos:desc' });
    const id = (conPedidos.body.items as { idSucursal: number; cantidadPedidos: number }[])[0]!;

    // Act
    const invalida = await admin.post('/api/sucursales').send(sinNombre);
    const eliminar = await admin.delete(`/api/sucursales/${id.idSucursal}`);

    // Assert
    expect(invalida.status).toBe(400);
    expect(id.cantidadPedidos).toBeGreaterThan(0);
    expect(eliminar.status).toBe(409);
    expect(eliminar.body.error.code).toBe('EN_USO');
  });

  it('la lista pública solo trae activas, con X-Cache, y una escritura la invalida', async () => {
    // Arrange
    const primera = await request(app).get('/api/catalogo/sucursales');
    const segunda = await request(app).get('/api/catalogo/sucursales');
    const nombre = nombreUnico();

    // Act
    const creada = await admin.post('/api/sucursales').send(datos(nombre));
    const tras = await request(app).get('/api/catalogo/sucursales');
    await admin.patch(`/api/sucursales/${creada.body.idSucursal}/estado`).send({ activo: false });
    const oculta = await request(app).get('/api/catalogo/sucursales');

    // Assert
    expect(segunda.headers['x-cache']).toBe('HIT');
    expect(primera.body[0]).not.toHaveProperty('activo');
    expect((primera.body as { idSucursal: number }[]).map((s) => s.idSucursal)).not.toContain(
      idInactiva,
    );
    expect(tras.headers['x-cache']).toBe('MISS');
    expect((tras.body as { nombre: string }[]).map((s) => s.nombre)).toContain(nombre);
    expect((oculta.body as { nombre: string }[]).map((s) => s.nombre)).not.toContain(nombre);
  });

  it('GET /api/metodos-envio marca el retiro con requiereSucursal', async () => {
    // Act
    const respuesta = await request(app).get('/api/metodos-envio');

    // Assert
    const metodos = respuesta.body as { idMetodoEnvio: number; requiereSucursal: boolean }[];
    expect(metodos.find((m) => m.idMetodoEnvio === idRetiro)?.requiereSucursal).toBe(true);
    expect(metodos.find((m) => m.idMetodoEnvio === idDomicilio)?.requiereSucursal).toBe(false);
  });
});

describe('Checkout con retiro en sucursal', () => {
  let cliente: ClientePrueba;

  async function conCarrito(): Promise<ClientePrueba> {
    const c = await nuevoCliente(app);
    const variante = await crearVariante(admin, 5);
    const r = await agregarAlCarrito(c.http, variante.idVariante, 1);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return c;
  }

  const cuerpo = (extra: Record<string, unknown>) => ({
    metodoPago: 'TARJETA',
    datosPago: { titular: 'Cliente de Prueba', ultimos4: '4242' },
    ...extra,
  });

  beforeAll(async () => {
    cliente = await conCarrito();
  });

  it('retiro sin dirección → 201 y el detalle trae retiroEnSucursal y la sucursal', async () => {
    // Arrange
    const clave = randomUUID();
    const body = cuerpo({ idMetodoEnvio: idRetiro, idSucursal });
    const inicio = await cliente.http
      .post('/api/checkout/iniciar')
      .send({ idMetodoEnvio: idRetiro, idSucursal });

    // Act
    const pago = await cliente.http
      .post('/api/checkout/pagar')
      .set('Idempotency-Key', clave)
      .send(body);
    const repetido = await cliente.http
      .post('/api/checkout/pagar')
      .set('Idempotency-Key', clave)
      .send(body);
    const detalle = await cliente.http.get(`/api/pedidos/${pago.body.idPedido}`);

    // Assert
    expect(inicio.status, JSON.stringify(inicio.body)).toBe(200);
    expect(pago.status, JSON.stringify(pago.body)).toBe(201);
    expect(repetido.status).toBe(200);
    expect(repetido.body.idPedido).toBe(pago.body.idPedido);
    expect(detalle.body).toMatchObject({
      retiroEnSucursal: true,
      sucursal: { idSucursal },
      direccion: { idDireccion: null },
      costoEnvio: '0.00',
    });
    expect(detalle.body.direccion.entrega).toMatch(/^Recoger en /);
  });

  it('retiro con idDireccion: se ignora y la misma clave con otra sucursal → 409', async () => {
    // Arrange
    const c = await conCarrito();
    const clave = randomUUID();
    const otra = (await request(app).get('/api/catalogo/sucursales')).body.find(
      (s: { idSucursal: number }) => s.idSucursal !== idSucursal,
    ).idSucursal as number;
    const body = cuerpo({
      idMetodoEnvio: idRetiro,
      idSucursal,
      idDireccion: c.idDireccion,
    });

    const inicio = await c.http
      .post('/api/checkout/iniciar')
      .send({ idMetodoEnvio: idRetiro, idSucursal, idDireccion: c.idDireccion });

    // Act
    const pago = await c.http.post('/api/checkout/pagar').set('Idempotency-Key', clave).send(body);
    const conflicto = await c.http
      .post('/api/checkout/pagar')
      .set('Idempotency-Key', clave)
      .send({ ...body, idSucursal: otra });

    // Assert
    expect(inicio.status, JSON.stringify(inicio.body)).toBe(200);
    expect(pago.status, JSON.stringify(pago.body)).toBe(201);
    expect(conflicto.status).toBe(409);
    expect(conflicto.body.error.code).toBe('IDEMPOTENCIA_CONFLICTO');
  });

  it('retiro sin sucursal → 400', async () => {
    // Act
    const respuesta = await cliente.http
      .post('/api/checkout/iniciar')
      .send({ idMetodoEnvio: idRetiro });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('retiro en una sucursal inactiva → 404', async () => {
    // Act
    const respuesta = await cliente.http
      .post('/api/checkout/iniciar')
      .send({ idMetodoEnvio: idRetiro, idSucursal: idInactiva });

    // Assert
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });

  it('domicilio sin dirección → 400', async () => {
    // Act
    const respuesta = await cliente.http
      .post('/api/checkout/iniciar')
      .send({ idMetodoEnvio: idDomicilio });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });
});

describe('Gestión de sucursales: acceso por rol', () => {
  const rutas = [
    ['GET', '/api/sucursales'],
    ['GET', '/api/sucursales/1'],
    ['POST', '/api/sucursales'],
    ['PUT', '/api/sucursales/1'],
    ['PATCH', '/api/sucursales/1/estado'],
    ['DELETE', '/api/sucursales/1'],
  ] as const;

  it.each(rutas)('%s %s sin token → 401', async (metodo, ruta) => {
    // Act
    const respuesta = await request(app)[metodo.toLowerCase() as 'get'](ruta);

    // Assert
    expect(respuesta.status).toBe(401);
  });

  it.each(rutas)('%s %s como Operador → 403 PROHIBIDO', async (metodo, ruta) => {
    // Act
    const respuesta = await operador[metodo.toLowerCase() as 'get'](ruta);

    // Assert
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.code).toBe('PROHIBIDO');
  });

  it.each(rutas)('%s %s como Cliente → 403 PROHIBIDO', async (metodo, ruta) => {
    // Arrange
    const { http: cliente } = await clienteComo(app, 'cliente');

    // Act
    const respuesta = await cliente[metodo.toLowerCase() as 'get'](ruta);

    // Assert
    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.code).toBe('PROHIBIDO');
  });
});

describe('Gestión de sucursales: errores', () => {
  const INEXISTENTE = 2_000_000_000;

  it.each([
    ['GET', (id: number) => admin.get(`/api/sucursales/${id}`)],
    ['PUT', (id: number) => admin.put(`/api/sucursales/${id}`).send(datos(nombreUnico()))],
    ['PATCH', (id: number) => admin.patch(`/api/sucursales/${id}/estado`).send({ activo: false })],
    ['DELETE', (id: number) => admin.delete(`/api/sucursales/${id}`)],
  ])('%s de un id inexistente → 404 NO_ENCONTRADO', async (_metodo, peticion) => {
    // Act
    const respuesta = await peticion(INEXISTENTE);

    // Assert
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });

  it('PUT con el nombre de otra sucursal → 409 DUPLICADO y no la modifica', async () => {
    // Arrange
    const [una, otra] = await Promise.all([crearSucursal(admin), crearSucursal(admin)]);

    // Act
    const respuesta = await admin.put(`/api/sucursales/${otra.idSucursal}`).send(datos(una.nombre));

    // Assert
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('DUPLICADO');
    const intacta = await admin.get(`/api/sucursales/${otra.idSucursal}`);
    expect(intacta.body.nombre).toBe(otra.nombre);
  });

  it('eliminar una sucursal que tiene un pedido → 409 EN_USO y la sucursal sigue existiendo', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    const { cliente, idMetodoEnvio } = await prepararRetiro(app, admin, idSucursal);
    const pago = await pagarRetiro(cliente, idMetodoEnvio, idSucursal);
    expect(pago.status, JSON.stringify(pago.body)).toBe(201);

    // Act
    const respuesta = await admin.delete(`/api/sucursales/${idSucursal}`);

    // Assert
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('EN_USO');
    const sigue = await admin.get(`/api/sucursales/${idSucursal}`);
    expect(sigue.body).toMatchObject({ idSucursal, cantidadPedidos: 1 });
  });

  it.each([
    ['teléfono inválido', { telefono: 'abc' }],
    ['código postal de 4 dígitos', { codigoPostal: '0101' }],
    ['nombre de más de 100 caracteres', { nombre: 'x'.repeat(101) }],
  ])('POST con %s → 400 VALIDACION', async (_caso, cambio) => {
    // Act
    const respuesta = await admin
      .post('/api/sucursales')
      .send({ ...datos(nombreUnico()), ...cambio });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('PATCH estado con un valor no booleano → 400 VALIDACION', async () => {
    // Act
    const respuesta = await admin.patch('/api/sucursales/1/estado').send({ activo: 'no' });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });
});

describe('Gestión de sucursales: bitácora', () => {
  interface Entrada {
    modulo: string;
    entidad: string;
    accion: string;
    idRegistro: number | null;
  }

  it('crear, modificar, desactivar y eliminar quedan en la bitácora con Modulo=Sucursales', async () => {
    // Arrange
    const { idSucursal, nombre } = await crearSucursal(admin);
    await admin.put(`/api/sucursales/${idSucursal}`).send({ ...datos(nombre), horario: 'Nuevo' });
    await admin.patch(`/api/sucursales/${idSucursal}/estado`).send({ activo: false });
    await admin.delete(`/api/sucursales/${idSucursal}`);

    // Act
    const bitacora = await admin
      .get('/api/bitacora')
      .query({ modulo: 'Sucursales', idRegistro: idSucursal, pageSize: 20 });

    // Assert
    expect(bitacora.status).toBe(200);
    const entradas = bitacora.body.items as Entrada[];
    expect(entradas.map((e) => e.accion).sort()).toEqual([
      'CREAR',
      'DESACTIVAR',
      'ELIMINAR',
      'MODIFICAR',
    ]);
    for (const e of entradas) {
      expect(e).toMatchObject({
        modulo: 'Sucursales',
        entidad: 'Sucursal',
        idRegistro: idSucursal,
      });
    }
  });

  it('reactivar una sucursal registra ACTIVAR', async () => {
    // Arrange
    const { idSucursal } = await crearSucursal(admin);
    await admin.patch(`/api/sucursales/${idSucursal}/estado`).send({ activo: false });
    await admin.patch(`/api/sucursales/${idSucursal}/estado`).send({ activo: true });

    // Act
    const bitacora = await admin
      .get('/api/bitacora')
      .query({ modulo: 'Sucursales', idRegistro: idSucursal, accion: 'ACTIVAR' });

    // Assert
    expect(bitacora.status).toBe(200);
    expect(bitacora.body.items).toHaveLength(1);
  });
});

describe('Gestión de sucursales: caché del catálogo', () => {
  it.each(['/api/catalogo/sucursales', '/api/catalogo/categorias'])(
    'una escritura de sucursal invalida %s: HIT antes y MISS después',
    async (ruta) => {
      // Arrange
      await request(app).get(ruta);
      const calentada = await request(app).get(ruta);
      await crearSucursal(admin);

      // Act
      const tras = await request(app).get(ruta);

      // Assert
      expect(calentada.headers['x-cache']).toBe('HIT');
      expect(tras.headers['x-cache']).toBe('MISS');
    },
  );

  it.each([
    [
      'actualizar',
      (id: number, nombre: string) => admin.put(`/api/sucursales/${id}`).send(datos(nombre)),
    ],
    [
      'cambiar el estado',
      (id: number) => admin.patch(`/api/sucursales/${id}/estado`).send({ activo: false }),
    ],
    ['eliminar', (id: number) => admin.delete(`/api/sucursales/${id}`)],
  ])('%s una sucursal invalida la lista pública', async (_accion, escribir) => {
    // Arrange
    const { idSucursal, nombre } = await crearSucursal(admin);
    await request(app).get('/api/catalogo/sucursales');
    const calentada = await request(app).get('/api/catalogo/sucursales');
    const escritura = await escribir(idSucursal, nombre);
    expect(escritura.status).toBeLessThan(300);

    // Act
    const tras = await request(app).get('/api/catalogo/sucursales');

    // Assert
    expect(calentada.headers['x-cache']).toBe('HIT');
    expect(tras.headers['x-cache']).toBe('MISS');
  });

  it('una sucursal desactivada desaparece del endpoint público y una reactivada vuelve', async () => {
    // Arrange
    const { idSucursal, nombre } = await crearSucursal(admin);
    await admin.patch(`/api/sucursales/${idSucursal}/estado`).send({ activo: false });
    const oculta = await request(app).get('/api/catalogo/sucursales');
    await admin.patch(`/api/sucursales/${idSucursal}/estado`).send({ activo: true });

    // Act
    const visible = await request(app).get('/api/catalogo/sucursales');

    // Assert
    expect((oculta.body as { nombre: string }[]).map((s) => s.nombre)).not.toContain(nombre);
    expect((visible.body as { nombre: string }[]).map((s) => s.nombre)).toContain(nombre);
  });
});

describe('Gestión de sucursales: listado', () => {
  interface Item {
    idSucursal: number;
    nombre: string;
    activo: boolean;
    cantidadPedidos: number;
  }

  it.each([true, false])(
    'el filtro activo=%s solo trae sucursales con ese estado',
    async (activo) => {
      // Arrange
      await crearSucursal(admin);

      // Act
      const respuesta = await admin
        .get('/api/sucursales')
        .query({ activo: String(activo), pageSize: 100 });

      // Assert
      expect(respuesta.status).toBe(200);
      const items = respuesta.body.items as Item[];
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.activo === activo)).toBe(true);
      expect(items.map((i) => i.idSucursal).includes(idInactiva)).toBe(!activo);
    },
  );

  it('la búsqueda q filtra por nombre', async () => {
    // Arrange
    const marca = randomUUID().slice(0, 8);
    const { idSucursal } = await crearSucursal(admin, { nombre: `Busqueda ${marca}` });
    await crearSucursal(admin);

    // Act
    const respuesta = await admin.get('/api/sucursales').query({ q: marca });

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(1);
    expect((respuesta.body.items as Item[])[0]?.idSucursal).toBe(idSucursal);
  });

  it('ordena por cantidadPedidos descendente', async () => {
    // Act
    const respuesta = await admin
      .get('/api/sucursales')
      .query({ sort: 'cantidadPedidos:desc', pageSize: 100 });

    // Assert
    expect(respuesta.status).toBe(200);
    const cantidades = (respuesta.body.items as Item[]).map((i) => i.cantidadPedidos);
    expect(cantidades).toEqual([...cantidades].sort((a, b) => b - a));
    expect(cantidades[0]).toBeGreaterThan(0);
  });

  it('un sort fuera de la lista blanca → 400 VALIDACION', async () => {
    // Act
    const respuesta = await admin.get('/api/sucursales').query({ sort: 'telefono:asc' });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('pagina con total constante y páginas distintas', async () => {
    // Arrange
    await Promise.all([crearSucursal(admin), crearSucursal(admin)]);
    const primera = await admin.get('/api/sucursales').query({ page: 1, pageSize: 2 });

    // Act
    const segunda = await admin.get('/api/sucursales').query({ page: 2, pageSize: 2 });

    // Assert
    expect(primera.body.items).toHaveLength(2);
    expect(segunda.body).toMatchObject({ page: 2, pageSize: 2 });
    expect(segunda.body.total).toBe(primera.body.total);
    expect(primera.body.total).toBeGreaterThanOrEqual(6);
    const idsPrimera = (primera.body.items as Item[]).map((i) => i.idSucursal);
    const idsSegunda = (segunda.body.items as Item[]).map((i) => i.idSucursal);
    expect(idsSegunda.some((id) => idsPrimera.includes(id))).toBe(false);
  });
});
