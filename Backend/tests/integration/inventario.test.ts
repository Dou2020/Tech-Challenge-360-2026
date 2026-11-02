import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { ejecutarLiberacionReservas } from '../../src/jobs/liberarReservas.job.js';
import { clienteComo } from '../helpers/auth.js';

/*
 * Inventario y kardex (RF-03) y el job de reservas (RF-07). La base y Redis se comparten con los
 * demás archivos de integración: los movimientos se hacen sobre un producto nuevo con SKU
 * aleatorio, y de la semilla solo se leen la variante 4 (CAM-LIM-NEG-M, existencia 1) y la 13
 * (inactiva).
 */

const app = createApp();

type Http = Awaited<ReturnType<typeof clienteComo>>['http'];
let admin: Http;
let operador: Http;
let cliente: Http;

interface Movimiento {
  idMovimientoInventario: number;
  idVariante: number;
  fecha: string;
  codigoTipoMovimiento: string;
  signo: number;
  cantidad: number;
  existenciaAnterior: number;
  existenciaNueva: number;
  motivo: string;
  usuario: string;
}

interface Existencia {
  idVariante: number;
  sku: string;
  existenciaFisica: number;
  existenciaReservada: number;
  existenciaDisponible: number;
  bajoStock: boolean;
  activo: boolean;
}

/** Crea un producto de una sola variante y devuelve su id y SKU. */
async function crearVariante(existenciaInicial: number) {
  const sku = `INV-${randomUUID().slice(0, 8).toUpperCase()}`;
  const respuesta = await admin.post('/api/productos').send({
    idCategoria: 1,
    nombre: `Producto de inventario ${sku}`,
    variantes: [{ sku, precio: '99.00', existenciaInicial }],
  });
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
  return {
    idProducto: respuesta.body.idProducto as number,
    idVariante: respuesta.body.variantes[0].idVariante as number,
    sku,
  };
}

async function existenciaDe(sku: string): Promise<Existencia> {
  const respuesta = await operador.get('/api/inventario/existencias').query({ q: sku });
  expect(respuesta.status).toBe(200);
  const fila = (respuesta.body.items as Existencia[]).find((item) => item.sku === sku);
  expect(fila, `no aparece ${sku} en existencias`).toBeDefined();
  return fila!;
}

/** Día de Guatemala (UTC-6) de un instante ISO, como YYYY-MM-DD. */
const diaGuatemala = (iso: string) =>
  new Date(new Date(iso).getTime() - 6 * 3_600_000).toISOString().slice(0, 10);

beforeAll(async () => {
  await connectRedis();
  [{ http: admin }, { http: operador }, { http: cliente }] = await Promise.all([
    clienteComo(app, 'admin'),
    clienteComo(app, 'operador'),
    clienteComo(app, 'cliente'),
  ]);
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

describe('acceso por rol', () => {
  it('sin token → 401; Cliente → 403', async () => {
    const sinToken = await request(app).get('/api/inventario/existencias');
    expect(sinToken.status).toBe(401);
    expect(sinToken.body.error.code).toBe('NO_AUTENTICADO');

    const existencias = await cliente.get('/api/inventario/existencias');
    expect(existencias.status).toBe(403);
    expect(existencias.body.error.code).toBe('PROHIBIDO');

    const ajuste = await cliente
      .post('/api/inventario/ajustes')
      .send({ idVariante: 1, tipo: 'ENTRADA', cantidad: 1, motivo: 'No debería pasar' });
    expect(ajuste.status).toBe(403);
  });

  it('Operador y Administrador ven los tipos de movimiento', async () => {
    for (const http of [operador, admin]) {
      const respuesta = await http.get('/api/inventario/tipos-movimiento');
      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ codigo: 'ENTRADA_COMPRA', signo: 1 }),
          expect.objectContaining({ codigo: 'AJUSTE_SALIDA', signo: -1 }),
        ]),
      );
    }
  });
});

describe('RF-03 entradas, ajustes y kardex', () => {
  it('la existencia coincide con la suma del kardex y los movimientos se encadenan', async () => {
    const { idProducto, idVariante, sku } = await crearVariante(5);

    const entrada = await operador
      .post('/api/inventario/entradas')
      .send({ idVariante, cantidad: 10 });
    expect(entrada.status, JSON.stringify(entrada.body)).toBe(201);
    expect(entrada.body).toMatchObject({
      idVariante,
      sku,
      codigoTipoMovimiento: 'ENTRADA_COMPRA',
      signo: 1,
      cantidad: 10,
      existenciaAnterior: 5,
      existenciaNueva: 15,
      motivo: 'Entrada por compra',
      existenciaFisica: 15,
      existenciaReservada: 0,
      existenciaDisponible: 15,
    });
    expect(typeof entrada.body.idMovimientoInventario).toBe('number');

    const salida = await operador
      .post('/api/inventario/ajustes')
      .send({ idVariante, tipo: 'SALIDA', cantidad: 3, motivo: 'Producto dañado en bodega' });
    expect(salida.status, JSON.stringify(salida.body)).toBe(201);
    expect(salida.body).toMatchObject({
      codigoTipoMovimiento: 'AJUSTE_SALIDA',
      signo: -1,
      existenciaAnterior: 15,
      existenciaNueva: 12,
      motivo: 'Producto dañado en bodega',
      existenciaFisica: 12,
    });

    const ajusteEntrada = await admin
      .post('/api/inventario/ajustes')
      .send({ idVariante, tipo: 'ENTRADA', cantidad: 2, motivo: 'Conteo físico' });
    expect(ajusteEntrada.status).toBe(201);
    expect(ajusteEntrada.body.existenciaNueva).toBe(14);

    const kardex = await operador
      .get(`/api/inventario/variantes/${idVariante}/kardex`)
      .query({ sort: 'fecha:asc' });
    expect(kardex.status).toBe(200);
    const movimientos = kardex.body.items as Movimiento[];
    expect(kardex.body.total).toBe(4);
    expect(movimientos.map((m) => m.codigoTipoMovimiento)).toEqual([
      'INVENTARIO_INICIAL',
      'ENTRADA_COMPRA',
      'AJUSTE_SALIDA',
      'AJUSTE_ENTRADA',
    ]);

    // Cada movimiento parte de donde terminó el anterior y cambia exactamente signo × cantidad.
    expect(movimientos[0]!.existenciaAnterior).toBe(0);
    for (const [i, movimiento] of movimientos.entries()) {
      expect(movimiento.existenciaNueva).toBe(
        movimiento.existenciaAnterior + movimiento.signo * movimiento.cantidad,
      );
      if (i > 0) expect(movimiento.existenciaAnterior).toBe(movimientos[i - 1]!.existenciaNueva);
    }
    const sumaKardex = movimientos.reduce((suma, m) => suma + m.signo * m.cantidad, 0);
    expect(sumaKardex).toBe(14);

    // El detalle de existencias y el de gestión del producto dicen lo mismo que el kardex.
    expect((await existenciaDe(sku)).existenciaFisica).toBe(sumaKardex);
    const producto = await admin.get(`/api/productos/${idProducto}`);
    expect(producto.body.variantes[0].existenciaFisica).toBe(sumaKardex);
    expect(movimientos.at(-1)!.existenciaNueva).toBe(sumaKardex);
  });

  it('ajuste sin motivo → 400 VALIDACION sin tocar la existencia', async () => {
    const { idVariante, sku } = await crearVariante(4);

    const sinMotivo = await operador
      .post('/api/inventario/ajustes')
      .send({ idVariante, tipo: 'SALIDA', cantidad: 1 });
    expect(sinMotivo.status).toBe(400);
    expect(sinMotivo.body.error.code).toBe('VALIDACION');
    expect(sinMotivo.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'motivo' })]),
    );

    const motivoVacio = await operador
      .post('/api/inventario/ajustes')
      .send({ idVariante, tipo: 'SALIDA', cantidad: 1, motivo: '   ' });
    expect(motivoVacio.status).toBe(400);

    expect((await existenciaDe(sku)).existenciaFisica).toBe(4);
  });

  it('ajuste de salida mayor que la existencia → 422 EXISTENCIA_NEGATIVA sin movimiento', async () => {
    const { idVariante, sku } = await crearVariante(2);

    const respuesta = await operador
      .post('/api/inventario/ajustes')
      .send({ idVariante, tipo: 'SALIDA', cantidad: 3, motivo: 'Merma' });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.code).toBe('EXISTENCIA_NEGATIVA');
    expect(respuesta.body.requestId).toEqual(expect.any(String));

    expect((await existenciaDe(sku)).existenciaFisica).toBe(2);
    const kardex = await operador.get(`/api/inventario/variantes/${idVariante}/kardex`);
    expect(kardex.body.total).toBe(1);
  });

  it('variante inexistente → 404 en entradas, ajustes y kardex', async () => {
    const entrada = await operador
      .post('/api/inventario/entradas')
      .send({ idVariante: 999_999, cantidad: 1 });
    expect(entrada.status).toBe(404);
    expect(entrada.body.error.code).toBe('NO_ENCONTRADO');

    const ajuste = await operador
      .post('/api/inventario/ajustes')
      .send({ idVariante: 999_999, tipo: 'ENTRADA', cantidad: 1, motivo: 'x' });
    expect(ajuste.status).toBe(404);

    const kardex = await operador.get('/api/inventario/variantes/999999/kardex');
    expect(kardex.status).toBe(404);
  });

  it('cantidad no entera o ≤ 0 → 400', async () => {
    for (const cantidad of [0, -2, 1.5]) {
      const respuesta = await operador
        .post('/api/inventario/entradas')
        .send({ idVariante: 1, cantidad });
      expect(respuesta.status).toBe(400);
    }
  });
});

describe('filtros del kardex', () => {
  let idVariante: number;
  let ajuste: Movimiento;
  let antes: string;

  beforeAll(async () => {
    antes = new Date(Date.now() - 1_000).toISOString();
    ({ idVariante } = await crearVariante(8));
    const respuesta = await operador
      .post('/api/inventario/ajustes')
      .send({ idVariante, tipo: 'SALIDA', cantidad: 1, motivo: 'Muestra para catálogo' });
    expect(respuesta.status).toBe(201);
    ajuste = respuesta.body as Movimiento;
  });

  const kardex = (query: Record<string, string>) =>
    operador.get(`/api/inventario/variantes/${idVariante}/kardex`).query(query);

  it('tipo filtra por código (sin distinguir mayúsculas)', async () => {
    const respuesta = await kardex({ tipo: 'ajuste_salida' });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(1);
    expect(respuesta.body.items[0].idMovimientoInventario).toBe(ajuste.idMovimientoInventario);
  });

  it('un día YYYY-MM-DD en desde y hasta cubre el día completo de Guatemala', async () => {
    const dia = diaGuatemala(ajuste.fecha);
    const respuesta = await kardex({ desde: dia, hasta: dia });
    expect(respuesta.status).toBe(200);
    expect((respuesta.body.items as Movimiento[]).map((m) => m.idMovimientoInventario)).toContain(
      ajuste.idMovimientoInventario,
    );

    const otroDia = await kardex({ desde: '2020-01-01', hasta: '2020-01-01' });
    expect(otroDia.body.total).toBe(0);
  });

  it('instantes ISO con zona, inclusive', async () => {
    const respuesta = await kardex({ desde: antes, hasta: ajuste.fecha });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.total).toBe(2);

    const despues = await kardex({ desde: new Date(Date.now() + 60_000).toISOString() });
    expect(despues.body.total).toBe(0);
  });

  it('desde > hasta, instante sin zona, tipo inexistente u orden no permitido → 400', async () => {
    const consultas: Record<string, string>[] = [
      { desde: '2026-11-02', hasta: '2026-11-01' },
      { desde: '2026-11-01T10:00:00' },
      { tipo: 'NO_EXISTE' },
      { sort: 'cantidad:asc' },
    ];
    for (const query of consultas) {
      const respuesta = await kardex(query);
      expect(respuesta.status, JSON.stringify(query)).toBe(400);
      expect(respuesta.body.error.code).toBe('VALIDACION');
    }
  });
});

describe('existencias', () => {
  it('bajoStock=true incluye la variante 4 (existencia 1); bajoStock=false no', async () => {
    const bajo = await operador
      .get('/api/inventario/existencias')
      .query({ bajoStock: 'true', q: 'CAM-LIM-NEG-M' });
    expect(bajo.status).toBe(200);
    const variante4 = (bajo.body.items as Existencia[]).find((item) => item.idVariante === 4);
    expect(variante4).toMatchObject({ sku: 'CAM-LIM-NEG-M', bajoStock: true });
    expect(variante4!.existenciaDisponible).toBeLessThanOrEqual(5);

    const noBajo = await operador
      .get('/api/inventario/existencias')
      .query({ bajoStock: 'false', q: 'CAM-LIM-NEG-M' });
    expect((noBajo.body.items as Existencia[]).some((item) => item.idVariante === 4)).toBe(false);
  });

  it('incluye variantes inactivas y filtra por activo', async () => {
    const inactivas = await operador.get('/api/inventario/existencias').query({ activo: 'false' });
    expect(inactivas.status).toBe(200);
    expect((inactivas.body.items as Existencia[]).every((item) => !item.activo)).toBe(true);
    expect((inactivas.body.items as Existencia[]).some((item) => item.idVariante === 13)).toBe(
      true,
    );
  });

  it('pagina con { items, page, pageSize, total } y ordena por la lista blanca', async () => {
    const respuesta = await operador
      .get('/api/inventario/existencias')
      .query({ pageSize: 2, sort: 'existenciaFisica:desc' });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(respuesta.body.items).toHaveLength(2);
    const [a, b] = respuesta.body.items as Existencia[];
    expect(a!.existenciaFisica).toBeGreaterThanOrEqual(b!.existenciaFisica);
    expect(respuesta.body.total).toBeGreaterThan(2);
  });

  it('sort inválido → 400', async () => {
    const respuesta = await operador
      .get('/api/inventario/existencias')
      .query({ sort: 'precio:asc' });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });
});

describe('RF-07 job de liberación de reservas', () => {
  it('una pasada ejecuta el SP real y devuelve los contadores; la siguiente no encuentra nada', async () => {
    const primera = await ejecutarLiberacionReservas();
    expect(primera).toEqual({
      reservasLiberadas: expect.any(Number),
      unidadesLiberadas: expect.any(Number),
      variantesAfectadas: expect.any(Number),
    });

    // Lo vencido ya quedó LIBERADA en la pasada anterior.
    expect(await ejecutarLiberacionReservas()).toEqual({
      reservasLiberadas: 0,
      unidadesLiberadas: 0,
      variantesAfectadas: 0,
    });
  });

  // Crear una reserva necesita SP_Inventario_ReservarExistencia (POST /api/checkout/iniciar).
  it.todo(
    'una reserva vencida se libera al correr el job: ExistenciaReservada baja y la disponible vuelve',
  );
});
