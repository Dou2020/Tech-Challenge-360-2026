import request from 'supertest';
import { randomUUID } from 'node:crypto';
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

describe('Invalidación de la caché de reportes por catálogo y configuración', () => {
  /** Hoy ± 1 día: cubre la diferencia entre la fecha UTC y la de Guatemala. */
  const rangoHoy = (): string => {
    const hoy = new Date().toISOString().slice(0, 10);
    return rango(dia(hoy, -1), dia(hoy, 1));
  };
  const rutaCategorias = () => `/api/reportes/ventas-por-categoria?${rangoHoy()}`;
  const rutaTop = () => `/api/reportes/productos-mas-vendidos?limite=100&${rangoHoy()}`;
  const sufijo = () => randomUUID().slice(0, 8).toUpperCase();

  interface Escenario {
    idCategoria: number;
    idProducto: number;
    nombreProducto: string;
  }

  const crearCategoria = async (nombre: string): Promise<number> => {
    const r = await admin.post('/api/categorias').send({ nombre });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.idCategoria as number;
  };

  /** Categoría propia con un producto propio vendido y entregado hoy. */
  const ventaEntregada = async (): Promise<Escenario> => {
    const idCategoria = await crearCategoria(`Cat reportes ${sufijo()}`);
    const { idProducto } = await crearVariante(admin, 5);
    const nombreProducto = `Prod reportes ${sufijo()}`;
    const mover = await admin
      .put(`/api/productos/${idProducto}`)
      .send({ idCategoria, nombre: nombreProducto });
    expect(mover.status, JSON.stringify(mover.body)).toBe(200);
    const comprador = await nuevoCliente(app);
    const idVariante = (mover.body.variantes as { idVariante: number }[])[0]!.idVariante;
    const idPedido = await comprar(comprador, await metodoEnvio(app), [
      { idVariante, cantidad: 3 },
    ]);
    await avanzarPedido(operador, idPedido, 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO');
    return { idCategoria, idProducto, nombreProducto };
  };

  /** Deja la clave vigente poblada y confirma que la segunda lectura es HIT. */
  const calentar = async (ruta: string): Promise<void> => {
    await admin.get(ruta);
    expect((await admin.get(ruta)).headers['x-cache']).toBe('HIT');
  };

  type FilaCategoria = { idCategoria: number; categoria: string; unidadesNetas: number };
  type FilaProducto = { idProducto: number; producto: string; idCategoria: number };

  it('renombrar la categoría con PUT → ventas-por-categoria pasa de HIT a MISS con el nombre nuevo', async () => {
    // Arrange
    const { idCategoria } = await ventaEntregada();
    await calentar(rutaCategorias());
    const nombreNuevo = `Cat renombrada ${sufijo()}`;

    // Act
    const put = await admin.put(`/api/categorias/${idCategoria}`).send({ nombre: nombreNuevo });
    const reporte = await admin.get(rutaCategorias());

    // Assert
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(reporte.headers['x-cache']).toBe('MISS');
    const fila = (reporte.body as FilaCategoria[]).find((c) => c.idCategoria === idCategoria);
    expect(fila).toMatchObject({ categoria: nombreNuevo, unidadesNetas: 3 });
  });

  it('mover el producto a otra categoría con PUT → ventas-por-categoria es MISS y las ventas pasan a la nueva', async () => {
    // Arrange
    const { idCategoria, idProducto, nombreProducto } = await ventaEntregada();
    const idCategoriaNueva = await crearCategoria(`Cat destino ${sufijo()}`);
    await calentar(rutaCategorias());

    // Act
    const put = await admin
      .put(`/api/productos/${idProducto}`)
      .send({ idCategoria: idCategoriaNueva, nombre: nombreProducto });
    const reporte = await admin.get(rutaCategorias());

    // Assert
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(reporte.headers['x-cache']).toBe('MISS');
    const filas = reporte.body as FilaCategoria[];
    expect(filas.find((c) => c.idCategoria === idCategoriaNueva)?.unidadesNetas).toBe(3);
    expect(filas.find((c) => c.idCategoria === idCategoria)).toBeUndefined();
  });

  it('renombrar el producto con PUT → productos-mas-vendidos pasa de HIT a MISS con el nombre nuevo', async () => {
    // Arrange
    const { idCategoria, idProducto } = await ventaEntregada();
    await calentar(rutaTop());
    const nombreNuevo = `Prod renombrado ${sufijo()}`;

    // Act
    const put = await admin
      .put(`/api/productos/${idProducto}`)
      .send({ idCategoria, nombre: nombreNuevo });
    const reporte = await admin.get(rutaTop());

    // Assert
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(reporte.headers['x-cache']).toBe('MISS');
    const fila = (reporte.body as FilaProducto[]).find((p) => p.idProducto === idProducto);
    expect(fila?.producto).toBe(nombreNuevo);
  });

  it('PUT /api/configuracion/HorasCarritoAbandonado → el siguiente resumen es MISS', async () => {
    // Arrange
    const ruta = `/api/reportes/resumen?${rangoHoy()}`;
    const lista = await admin.get('/api/configuracion');
    const original = (lista.body as { clave: string; valor: string }[]).find(
      (p) => p.clave === 'HorasCarritoAbandonado',
    )!.valor;
    const nuevo = String(Number(original) + 1);
    await calentar(ruta);

    try {
      // Act
      const put = await admin
        .put('/api/configuracion/HorasCarritoAbandonado')
        .send({ valor: nuevo });
      const reporte = await admin.get(ruta);

      // Assert
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      expect(reporte.headers['x-cache']).toBe('MISS');
    } finally {
      await admin.put('/api/configuracion/HorasCarritoAbandonado').send({ valor: original });
    }
  });

  it.each([
    ['categoría', (e: Escenario) => `/api/categorias/${e.idCategoria}/estado`],
    ['producto', (e: Escenario) => `/api/productos/${e.idProducto}/estado`],
  ])('el PATCH de estado de una %s deja el reporte en HIT', async (_nombre, ruta) => {
    // Arrange
    const escenario = await ventaEntregada();
    await calentar(rutaCategorias());

    // Act
    const patch = await admin.patch(ruta(escenario)).send({ activo: false });
    const reporte = await admin.get(rutaCategorias());

    // Assert
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);
    expect(reporte.headers['x-cache']).toBe('HIT');
  });

  it('un PUT de categoría que falla por nombre duplicado (409) deja el reporte en HIT', async () => {
    // Arrange
    const { idCategoria } = await ventaEntregada();
    const otra = `Cat otra ${sufijo()}`;
    await crearCategoria(otra);
    await calentar(rutaCategorias());

    // Act
    const put = await admin.put(`/api/categorias/${idCategoria}`).send({ nombre: otra });
    const reporte = await admin.get(rutaCategorias());

    // Assert
    expect(put.status).toBe(409);
    expect(put.body.error.code).toBe('DUPLICADO');
    expect(reporte.headers['x-cache']).toBe('HIT');
  });

  it('un PUT de producto que falla porque no existe (404) deja el reporte en HIT', async () => {
    // Arrange
    const { idCategoria } = await ventaEntregada();
    await calentar(rutaTop());

    // Act
    const put = await admin
      .put('/api/productos/2147483647')
      .send({ idCategoria, nombre: `Fantasma ${sufijo()}` });
    const reporte = await admin.get(rutaTop());

    // Assert
    expect(put.status).toBe(404);
    expect(reporte.headers['x-cache']).toBe('HIT');
  });
});
