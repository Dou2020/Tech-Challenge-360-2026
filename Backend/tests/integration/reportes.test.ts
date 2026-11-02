import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo } from '../helpers/auth.js';
import {
  avanzarPedido,
  comprar,
  crearVariante,
  metodoEnvio,
  nuevoCliente,
  type Http,
} from '../helpers/pedidos.js';

/*
 * Reportes (RF-08). Otros archivos crean pedidos y los entregan hoy, así que todo se afirma sobre
 * rangos pasados de la semilla (D-12 a D-4), nunca sobre totales sin filtro. D se calcula desde
 * la fecha del pedido 2 (D-9 a las 02:00 UTC = 20:00 del día anterior en Guatemala).
 */

const app = createApp();
let admin: Http;
let operador: Http;
let cliente: Http;
/** Fecha UTC del pedido 2 (YYYY-MM-DD) = D-9. */
let utcPedido2: string;

const dia = (base: string, desfase: number): string => {
  const fecha = new Date(`${base}T00:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + desfase);
  return fecha.toISOString().slice(0, 10);
};
/** Día D, con D = fecha UTC del pedido 2 + 9. */
let D: string;
const rango = (desde: string, hasta: string) => `desde=${desde}&hasta=${hasta}`;

beforeAll(async () => {
  await connectRedis();
  admin = (await clienteComo(app, 'admin')).http;
  operador = (await clienteComo(app, 'operador')).http;
  cliente = (await clienteComo(app, 'cliente')).http;
  const pedido2 = await admin.get('/api/pedidos/2');
  expect(pedido2.status, JSON.stringify(pedido2.body)).toBe(200);
  utcPedido2 = (pedido2.body.fechaCreacion as string).slice(0, 10);
  D = dia(utcPedido2, 9);
});

afterAll(async () => {
  await closeRedis();
  await closePool();
});

describe('GET /api/reportes (RF-08)', () => {
  it('resumen del día local del pedido 2 (fecha UTC - 1): 378.50 y 1 pedido', async () => {
    // Arrange
    const local = dia(utcPedido2, -1);

    // Act
    const r = await admin.get(`/api/reportes/resumen?${rango(local, local)}`);

    // Assert
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({
      ventasNetas: '378.50',
      pedidos: 1,
      ticketPromedio: '378.50',
      unidadesNetas: 2,
      envioCobrado: '45.00',
    });
  });

  it('con la fecha UTC del pedido 2 no aparece (cuenta en el día local anterior)', async () => {
    // Arrange
    const utc = utcPedido2;

    // Act
    const r = await admin.get(`/api/reportes/resumen?${rango(utc, utc)}`);

    // Assert
    expect(r.status).toBe(200);
    expect(r.body.pedidos).toBe(0);
    expect(r.body.ventasNetas).toBe('0.00');
  });

  it('serie por día D-12…D-4: 4 filas; sin el cancelado y con el pedido 5 neto de devoluciones', async () => {
    // Arrange
    const filtro = rango(dia(D, -12), dia(D, -4));

    // Act
    const r = await admin.get(`/api/reportes/ventas?agrupacion=dia&${filtro}`);

    // Assert
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toEqual([
      { periodoInicio: dia(D, -12), ventas: '377.00', pedidos: 1, unidadesNetas: 3 },
      { periodoInicio: dia(D, -10), ventas: '378.50', pedidos: 1, unidadesNetas: 2 },
      { periodoInicio: dia(D, -6), ventas: '410.50', pedidos: 1, unidadesNetas: 5 },
      { periodoInicio: dia(D, -4), ventas: '349.00', pedidos: 1, unidadesNetas: 4 },
    ]);
  });

  it('categorías y top de productos del rango suman lo mismo que el resumen (1515.00, 14 u.)', async () => {
    // Arrange
    const filtro = rango(dia(D, -12), dia(D, -4));

    // Act
    const resumen = await admin.get(`/api/reportes/resumen?${filtro}`);
    const categorias = await admin.get(`/api/reportes/ventas-por-categoria?${filtro}`);
    const top = await admin.get(`/api/reportes/productos-mas-vendidos?${filtro}`);

    // Assert
    expect(resumen.body).toMatchObject({
      ventasNetas: '1515.00',
      pedidos: 4,
      unidadesNetas: 14,
      envioCobrado: '120.00',
    });
    const cats = categorias.body as {
      ventaNeta: string;
      unidadesNetas: number;
      categoria: string;
    }[];
    const prods = top.body as { ventaNeta: string; unidadesNetas: number; idProducto: number }[];
    const suma = (xs: { ventaNeta: string }[]) =>
      xs.reduce((total, x) => total + Number(x.ventaNeta), 0).toFixed(2);
    expect(suma(cats)).toBe('1515.00');
    expect(suma(prods)).toBe('1515.00');
    expect(cats.reduce((n, c) => n + c.unidadesNetas, 0)).toBe(14);
    expect(prods.reduce((n, p) => n + p.unidadesNetas, 0)).toBe(14);
    expect(cats[0]).toMatchObject({
      idCategoria: 1,
      unidadesVendidas: 9,
      unidadesDevueltas: 1,
      ventaBruta: '794.00',
      montoReembolsado: '95.00',
      ventaNeta: '699.00',
    });
    expect(prods[0]).toMatchObject({ idProducto: 1, unidadesNetas: 8, ventaNeta: '699.00' });
  });

  it('el límite recorta el top de productos', async () => {
    // Arrange
    const filtro = rango(dia(D, -12), dia(D, -4));

    // Act
    const r = await admin.get(`/api/reportes/productos-mas-vendidos?limite=2&${filtro}`);

    // Assert
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
  });

  it('carritos abandonados responde paginado', async () => {
    // Arrange
    const ruta = '/api/reportes/carritos-abandonados?page=1&pageSize=5&sort=valor:desc';

    // Act
    const r = await admin.get(ruta);

    // Assert
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ page: 1, pageSize: 5 });
    expect(Array.isArray(r.body.items)).toBe(true);
    expect(typeof r.body.total).toBe('number');
  });

  it('agrupacion inválida, limite 0, desde > hasta y fecha mal formada → 400 VALIDACION', async () => {
    // Arrange
    const rutas = [
      '/api/reportes/ventas?agrupacion=anio',
      '/api/reportes/productos-mas-vendidos?limite=0',
      `/api/reportes/resumen?${rango('2026-10-31', '2026-10-01')}`,
      '/api/reportes/ventas-por-categoria?desde=31-10-2026',
      '/api/reportes/carritos-abandonados?sort=otro:asc',
    ];

    // Act
    const respuestas = await Promise.all(rutas.map((ruta) => admin.get(ruta)));

    // Assert
    for (const r of respuestas) {
      expect(r.status, JSON.stringify(r.body)).toBe(400);
      expect(r.body.error.code).toBe('VALIDACION');
    }
  });

  it('Cliente y Operador → 403; sin token → 401', async () => {
    // Arrange
    const ruta = '/api/reportes/resumen';

    // Act
    const comoCliente = await cliente.get(ruta);
    const comoOperador = await operador.get(ruta);
    const anonimo = await request(app).get(ruta);

    // Assert
    expect(comoCliente.status).toBe(403);
    expect(comoOperador.status).toBe(403);
    expect(anonimo.status).toBe(401);
  });
});

describe('Caché de reportes (Redis)', () => {
  it('MISS, HIT y de nuevo MISS después de cancelar un pedido', async () => {
    // Arrange
    const ruta = `/api/reportes/ventas-por-categoria?${rango(dia(D, -12), dia(D, -4))}`;
    const comprador = await nuevoCliente(app);
    const { idVariante } = await crearVariante(admin, 5);
    const idPedido = await comprar(comprador, await metodoEnvio(app), [
      { idVariante, cantidad: 1 },
    ]);
    await admin.get(ruta); // deja la clave de la versión vigente poblada

    // Act
    const segunda = await admin.get(ruta);
    const cancelar = await comprador.http.post(`/api/pedidos/${idPedido}/cancelar`).send({});
    const tercera = await admin.get(ruta);

    // Assert
    expect(segunda.headers['x-cache']).toBe('HIT');
    expect(cancelar.status, JSON.stringify(cancelar.body)).toBe(200);
    expect(tercera.headers['x-cache']).toBe('MISS');
    expect(tercera.body).toEqual(segunda.body);
  });

  it('cambiar el estado de un pedido deja MISS en el siguiente reporte', async () => {
    // Arrange
    const ruta = `/api/reportes/ventas-por-categoria?${rango(dia(D, -12), dia(D, -4))}`;
    const comprador = await nuevoCliente(app);
    const { idVariante } = await crearVariante(admin, 5);
    const idPedido = await comprar(comprador, await metodoEnvio(app), [
      { idVariante, cantidad: 1 },
    ]);
    await admin.get(ruta);
    expect((await admin.get(ruta)).headers['x-cache']).toBe('HIT');
    await avanzarPedido(operador, idPedido, 'EN_PREPARACION');

    // Act
    const respuesta = await admin.get(ruta);

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['x-cache']).toBe('MISS');
  });

  it('registrar una devolución deja MISS en el siguiente reporte', async () => {
    // Arrange
    const ruta = `/api/reportes/ventas-por-categoria?${rango(dia(D, -12), dia(D, -4))}`;
    const comprador = await nuevoCliente(app);
    const { idVariante } = await crearVariante(admin, 5);
    const idPedido = await comprar(comprador, await metodoEnvio(app), [
      { idVariante, cantidad: 2 },
    ]);
    await avanzarPedido(operador, idPedido, 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO');
    const pedido = await comprador.http.get(`/api/pedidos/${idPedido}`);
    const idPedidoDetalle = pedido.body.lineas[0].idPedidoDetalle as number;
    await admin.get(ruta);
    expect((await admin.get(ruta)).headers['x-cache']).toBe('HIT');
    const devolucion = await operador
      .post(`/api/pedidos/${idPedido}/devoluciones`)
      .send({ motivo: 'Defecto', lineas: [{ idPedidoDetalle, cantidad: 1 }] });
    expect(devolucion.status, JSON.stringify(devolucion.body)).toBe(201);

    // Act
    const respuesta = await admin.get(ruta);

    // Assert
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['x-cache']).toBe('MISS');
  });

  it('un pago nuevo también invalida: el reporte siguiente es MISS', async () => {
    // Arrange
    const ruta = `/api/reportes/ventas-por-categoria?${rango(dia(D, -12), dia(D, -4))}`;
    const comprador = await nuevoCliente(app);
    const { idVariante } = await crearVariante(admin, 5);
    await admin.get(ruta);
    expect((await admin.get(ruta)).headers['x-cache']).toBe('HIT');
    await comprar(comprador, await metodoEnvio(app), [{ idVariante, cantidad: 1 }]);

    // Act
    const respuesta = await admin.get(ruta);

    // Assert
    expect(respuesta.headers['x-cache']).toBe('MISS');
  });

  it('la primera consulta de un filtro nuevo es MISS y la repetida HIT', async () => {
    // Arrange
    const ruta = `/api/reportes/resumen?${rango('2020-01-01', '2020-01-02')}`;

    // Act
    const primera = await admin.get(ruta);
    const segunda = await admin.get(ruta);

    // Assert
    expect(primera.headers['x-cache']).toBe('MISS');
    expect(segunda.headers['x-cache']).toBe('HIT');
  });
});
