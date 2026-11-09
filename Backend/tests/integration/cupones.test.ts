import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo, registrarCliente } from '../helpers/auth.js';
import {
  comprar,
  crearCupon,
  crearVariante,
  metodoEnvio,
  nuevoCliente,
} from '../helpers/pedidos.js';

/*
 * Gestión de cupones (RF-05), solo Administrador. Los cupones se crean con un código aleatorio;
 * de la semilla solo se lee AGOTADO5 (nunca se elimina ni se modifica).
 */

const app = createApp();

type Http = Awaited<ReturnType<typeof clienteComo>>['http'];
let admin: Http;
let operador: Http;
let cliente: Http;

interface Cupon {
  idCupon: number;
  codigo: string;
  tipoDescuento: string;
  valor: string;
  montoMinimo: string;
  fechaInicio: string;
  fechaFin: string;
  limiteUsosTotal: number;
  limiteUsosPorCliente: number;
  usosActuales: number;
  usosDisponibles: number;
  activo: boolean;
  vigente: boolean;
  puedeEliminarse: boolean;
}

const codigoUnico = () => `T${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;

function cuerpo(cambios: Record<string, unknown> = {}) {
  return {
    codigo: codigoUnico(),
    descripcion: 'Cupón de prueba',
    tipoDescuento: 'PORCENTAJE',
    valor: '15',
    montoMinimo: '100.00',
    fechaInicio: new Date(Date.now() - 86_400_000).toISOString(),
    fechaFin: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    limiteUsosTotal: 5,
    limiteUsosPorCliente: 2,
    ...cambios,
  };
}

async function crear(cambios: Record<string, unknown> = {}): Promise<Cupon> {
  const respuesta = await admin.post('/api/cupones').send(cuerpo(cambios));
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
  return respuesta.body as Cupon;
}

beforeAll(async () => {
  await connectRedis();
  admin = (await clienteComo(app, 'admin')).http;
  operador = (await clienteComo(app, 'operador')).http;
  cliente = (await clienteComo(app, 'cliente')).http;
});

afterAll(async () => {
  await closePool();
  await closeRedis();
});

describe('Acceso', () => {
  it('sin token 401; Cliente y Operador 403', async () => {
    expect((await request(app).get('/api/cupones')).status).toBe(401);
    expect((await cliente.get('/api/cupones')).status).toBe(403);
    expect((await operador.get('/api/cupones')).status).toBe(403);
    expect((await cliente.post('/api/cupones').send(cuerpo())).status).toBe(403);
    expect((await cliente.delete('/api/cupones/1')).status).toBe(403);
  });
});

describe('Crear', () => {
  it('crea el cupón activo, sin usos, con el código en mayúsculas', async () => {
    const codigo = codigoUnico().toLowerCase();
    const respuesta = await admin.post('/api/cupones').send(cuerpo({ codigo }));
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    const cupon = respuesta.body as Cupon;
    expect(respuesta.headers.location).toBe(`/api/cupones/${cupon.idCupon}`);
    expect(cupon).toMatchObject({
      codigo: codigo.toUpperCase(),
      tipoDescuento: 'PORCENTAJE',
      valor: '15.00',
      montoMinimo: '100.00',
      limiteUsosTotal: 5,
      limiteUsosPorCliente: 2,
      usosActuales: 0,
      usosDisponibles: 5,
      activo: true,
      vigente: true,
      puedeEliminarse: true,
    });
    expect(new Date(cupon.fechaFin).toISOString()).toBe(cupon.fechaFin);
  });

  it('un código repetido (sin distinguir mayúsculas) → 409 DUPLICADO', async () => {
    const cupon = await crear();
    const respuesta = await admin
      .post('/api/cupones')
      .send(cuerpo({ codigo: cupon.codigo.toLowerCase() }));
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('DUPLICADO');
  });

  it('rechaza datos inválidos con 400 VALIDACION', async () => {
    const casos: Record<string, unknown>[] = [
      { valor: '101' },
      { valor: '0' },
      { tipoDescuento: 'REGALO' },
      { fechaInicio: '2026-11-01T00:00:00' },
      { fechaFin: new Date(Date.now() - 2 * 86_400_000).toISOString() },
      { limiteUsosTotal: 0 },
      { limiteUsosPorCliente: 9 },
      { codigo: 'CON ESPACIOS' },
      { montoMinimo: '-1' },
    ];
    for (const caso of casos) {
      const respuesta = await admin.post('/api/cupones').send(cuerpo(caso));
      expect(respuesta.status, JSON.stringify(caso)).toBe(400);
      expect(respuesta.body.error.code).toBe('VALIDACION');
    }
  });

  it('una categoría inexistente → 404', async () => {
    const respuesta = await admin.post('/api/cupones').send(cuerpo({ idCategoria: 999_999 }));
    expect(respuesta.status).toBe(404);
  });

  it('un cupón de monto fijo por categoría', async () => {
    const cupon = await crear({ tipoDescuento: 'MONTO_FIJO', valor: '25.00', idCategoria: 2 });
    expect(cupon).toMatchObject({ tipoDescuento: 'MONTO_FIJO', valor: '25.00' });
  });
});

describe('Consultar', () => {
  it('detalle, listado con filtros y orden', async () => {
    const cupon = await crear();
    const detalle = await admin.get(`/api/cupones/${cupon.idCupon}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body).toMatchObject({ idCupon: cupon.idCupon, codigo: cupon.codigo });

    const lista = await admin.get('/api/cupones').query({ q: cupon.codigo });
    expect(lista.status).toBe(200);
    expect(lista.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect((lista.body.items as Cupon[])[0]?.idCupon).toBe(cupon.idCupon);

    const todos = await admin.get('/api/cupones').query({ sort: 'valor:desc', pageSize: 3 });
    expect(todos.status).toBe(200);
    expect((todos.body.items as Cupon[]).length).toBeLessThanOrEqual(3);
    expect(todos.body.total).toBeGreaterThanOrEqual(7);

    const agotados = await admin.get('/api/cupones').query({ q: 'AGOTADO5' });
    expect((agotados.body.items as Cupon[])[0]).toMatchObject({
      agotado: true,
      usosDisponibles: 0,
    });
  });

  describe('filtros activo y vigente', () => {
    // Cupones propios con un prefijo común: q los aísla de la semilla y de los demás archivos.
    const prefijo = codigoUnico().slice(0, 10);
    const dia = 86_400_000;
    const instante = (dias: number) => new Date(Date.now() + dias * dia).toISOString();

    beforeAll(async () => {
      await crear({ codigo: `${prefijo}EN`, fechaInicio: instante(-1), fechaFin: instante(30) });
      await crear({ codigo: `${prefijo}VE`, fechaInicio: instante(-30), fechaFin: instante(-1) });
      await crear({ codigo: `${prefijo}PR`, fechaInicio: instante(1), fechaFin: instante(30) });
      // Dentro de fechas pero desactivado: "vigente" solo mira las fechas.
      const inactivo = await crear({
        codigo: `${prefijo}IN`,
        fechaInicio: instante(-1),
        fechaFin: instante(30),
      });
      const estado = await admin
        .patch(`/api/cupones/${inactivo.idCupon}/estado`)
        .send({ activo: false });
      expect(estado.status).toBe(200);
    });

    it.each([
      { filtros: {}, esperados: ['EN', 'IN', 'PR', 'VE'] },
      { filtros: { vigente: 'true' }, esperados: ['EN', 'IN'] },
      { filtros: { vigente: 'false' }, esperados: ['PR', 'VE'] },
      { filtros: { activo: 'true' }, esperados: ['EN', 'PR', 'VE'] },
      { filtros: { activo: 'false' }, esperados: ['IN'] },
      { filtros: { activo: 'true', vigente: 'true' }, esperados: ['EN'] },
      { filtros: { activo: 'false', vigente: 'false' }, esperados: [] },
    ])('$filtros → $esperados', async ({ filtros, esperados }) => {
      // Arrange
      const consulta = { q: prefijo, sort: 'codigo:asc', pageSize: 100, ...filtros };

      // Act
      const respuesta = await admin.get('/api/cupones').query(consulta);

      // Assert
      expect(respuesta.status).toBe(200);
      expect(respuesta.body.total).toBe(esperados.length);
      expect((respuesta.body.items as Cupon[]).map((c) => c.codigo)).toEqual(
        esperados.map((sufijo) => `${prefijo}${sufijo}`),
      );
    });

    it.each(['si', '1', 'TRUE'])('vigente=%s → 400 VALIDACION', async (valor) => {
      // Act
      const respuesta = await admin.get('/api/cupones').query({ vigente: valor });

      // Assert
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.code).toBe('VALIDACION');
    });

    it('q de más de 100 caracteres → 400 VALIDACION', async () => {
      // Act
      const respuesta = await admin.get('/api/cupones').query({ q: 'A'.repeat(101) });

      // Assert
      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.code).toBe('VALIDACION');
    });
  });

  it('un orden fuera de la lista blanca → 400; un id inexistente → 404', async () => {
    expect((await admin.get('/api/cupones').query({ sort: 'activo:asc' })).status).toBe(400);
    expect((await admin.get('/api/cupones/999999')).status).toBe(404);
    expect((await admin.get('/api/cupones/abc')).status).toBe(400);
  });

  it('los usos de un cupón sin pedidos vienen vacíos', async () => {
    const cupon = await crear();
    const respuesta = await admin.get(`/api/cupones/${cupon.idCupon}/usos`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    expect((await admin.get('/api/cupones/999999/usos')).status).toBe(404);
  });
});

describe('Actualizar y cambiar estado', () => {
  it('el PUT reemplaza los campos editables', async () => {
    const cupon = await crear();
    const respuesta = await admin
      .put(`/api/cupones/${cupon.idCupon}`)
      .send(cuerpo({ codigo: cupon.codigo, valor: '20', limiteUsosTotal: 8 }));
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body).toMatchObject({ valor: '20.00', limiteUsosTotal: 8, activo: true });
  });

  it('un límite menor que los usos actuales → 400 (el esquema rechaza 0; con usos reales lo rechaza el SP)', async () => {
    const cupon = await crear();
    const respuesta = await admin
      .put(`/api/cupones/${cupon.idCupon}`)
      .send(cuerpo({ codigo: cupon.codigo, limiteUsosTotal: 0 }));
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('bajar limiteUsosTotal por debajo de usosActuales → 400 y los usos no cambian', async () => {
    // Arrange
    const cupon = await crearCupon(admin, { limiteUsosTotal: 3 });
    const variante = await crearVariante(admin, 5);
    const envio = await metodoEnvio(app);
    const [a, b] = await Promise.all([nuevoCliente(app), nuevoCliente(app)]);
    await comprar(a, envio, [{ idVariante: variante.idVariante, cantidad: 1 }], cupon.codigo);
    await comprar(b, envio, [{ idVariante: variante.idVariante, cantidad: 1 }], cupon.codigo);

    // Act
    const respuesta = await admin
      .put(`/api/cupones/${cupon.idCupon}`)
      .send(cuerpo({ codigo: cupon.codigo, limiteUsosTotal: 1, limiteUsosPorCliente: 1 }));

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    const despues = await admin.get(`/api/cupones/${cupon.idCupon}`);
    expect(despues.body).toMatchObject({ limiteUsosTotal: 3, usosActuales: 2 });
  });

  it('PUT de un cupón inexistente → 404; con el código de otro cupón → 409', async () => {
    const a = await crear();
    const b = await crear();
    expect((await admin.put('/api/cupones/999999').send(cuerpo())).status).toBe(404);
    const choque = await admin.put(`/api/cupones/${b.idCupon}`).send(cuerpo({ codigo: a.codigo }));
    expect(choque.status).toBe(409);
    expect(choque.body.error.code).toBe('DUPLICADO');
  });

  it('desactiva y reactiva; el body debe ser booleano', async () => {
    const cupon = await crear();
    const off = await admin.patch(`/api/cupones/${cupon.idCupon}/estado`).send({ activo: false });
    expect(off.status).toBe(200);
    expect(off.body.activo).toBe(false);
    const on = await admin.patch(`/api/cupones/${cupon.idCupon}/estado`).send({ activo: true });
    expect(on.body.activo).toBe(true);
    const malo = await admin.patch(`/api/cupones/${cupon.idCupon}/estado`).send({ activo: 'si' });
    expect(malo.status).toBe(400);
    expect((await admin.patch('/api/cupones/999999/estado').send({ activo: true })).status).toBe(
      404,
    );
  });

  it('un cupón desactivado se rechaza en el carrito con CUPON_INACTIVO', async () => {
    const cupon = await crear();
    await admin.patch(`/api/cupones/${cupon.idCupon}/estado`).send({ activo: false });
    const token = (await registrarCliente(app)).accessToken;
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).post('/api/carrito/items').set(auth).send({ idVariante: 1, cantidad: 2 });
    const respuesta = await request(app)
      .post('/api/carrito/cupon')
      .set(auth)
      .send({ codigo: cupon.codigo });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.code).toBe('CUPON_INACTIVO');
  });
});

describe('Eliminar', () => {
  it('elimina uno sin uso → 204 y luego 404', async () => {
    const cupon = await crear();
    const respuesta = await admin.delete(`/api/cupones/${cupon.idCupon}`);
    expect(respuesta.status).toBe(204);
    expect(respuesta.text).toBe('');
    expect((await admin.get(`/api/cupones/${cupon.idCupon}`)).status).toBe(404);
    expect((await admin.delete(`/api/cupones/${cupon.idCupon}`)).status).toBe(404);
  });

  it('un cupón con pedidos (aunque estén cancelados) → 409 EN_USO y sigue existiendo', async () => {
    // Arrange
    const cupon = await crearCupon(admin);
    const variante = await crearVariante(admin, 3);
    const comprador = await nuevoCliente(app);
    const idPedido = await comprar(
      comprador,
      await metodoEnvio(app),
      [{ idVariante: variante.idVariante, cantidad: 1 }],
      cupon.codigo,
    );
    const cancelado = await comprador.http.post(`/api/pedidos/${idPedido}/cancelar`).send({});
    expect(cancelado.status).toBe(200);

    // Act
    const respuesta = await admin.delete(`/api/cupones/${cupon.idCupon}`);

    // Assert
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('EN_USO');
    const despues = await admin.get(`/api/cupones/${cupon.idCupon}`);
    expect(despues.status).toBe(200);
    expect(despues.body).toMatchObject({
      usosActuales: 0,
      cantidadPedidos: 1,
      puedeEliminarse: false,
    });
  });
});
