import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo } from '../helpers/auth.js';

/*
 * Bitácora (solo lectura) y configuración del sistema. La configuración se comparte entre
 * archivos: todo valor que se cambia se restaura al terminar.
 */

const app = createApp();

type Http = Awaited<ReturnType<typeof clienteComo>>['http'];
let admin: Http;
let idAdmin: number;
let operador: Http;
let cliente: Http;

beforeAll(async () => {
  await connectRedis();
  const comoAdmin = await clienteComo(app, 'admin');
  admin = comoAdmin.http;
  idAdmin = comoAdmin.sesion.usuario.idUsuario;
  operador = (await clienteComo(app, 'operador')).http;
  cliente = (await clienteComo(app, 'cliente')).http;
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

interface Entrada {
  idBitacora: number;
  idUsuario: number;
  modulo: string;
  entidad: string;
  idRegistro: number | null;
  accion: string;
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
  fecha: string;
}

interface Parametro {
  clave: string;
  valor: string;
}

describe('acceso por rol', () => {
  it('Cliente y Operador reciben 403 en bitácora y configuración; sin token, 401', async () => {
    // Arrange
    const peticiones = [
      cliente.get('/api/bitacora'),
      operador.get('/api/bitacora'),
      operador.get('/api/bitacora/modulos'),
      cliente.get('/api/configuracion'),
      operador.put('/api/configuracion/MinutosReserva').send({ valor: '15' }),
    ];

    // Act
    const respuestas = await Promise.all(peticiones);
    const sinToken = await request(app).get('/api/bitacora');

    // Assert
    for (const respuesta of respuestas) expect(respuesta.status).toBe(403);
    expect(sinToken.status).toBe(401);
  });
});

describe('bitácora', () => {
  it('registra el cambio de precio con valorAnterior y valorNuevo como objetos', async () => {
    // Arrange
    const sku = `BIT-${randomUUID().slice(0, 8).toUpperCase()}`;
    const producto = await admin.post('/api/productos').send({
      idCategoria: 1,
      nombre: `Producto de bitácora ${sku}`,
      variantes: [{ sku, precio: '100.00', existenciaInicial: 1 }],
    });
    expect(producto.status, JSON.stringify(producto.body)).toBe(201);
    const idVariante = producto.body.variantes[0].idVariante as number;
    const antes = new Date().toISOString();

    // Act
    const cambio = await admin
      .patch(`/api/variantes/${idVariante}/precio`)
      .send({ precio: '149.50' });
    const bitacora = await admin
      .get('/api/bitacora')
      .query({ idRegistro: idVariante, accion: 'MODIFICAR', desde: antes });

    // Assert
    expect(cambio.status).toBe(200);
    expect(bitacora.status).toBe(200);
    const entrada = (bitacora.body.items as Entrada[]).find(
      (e) => e.valorNuevo !== null && Number(e.valorNuevo.Precio) === 149.5,
    );
    expect(entrada, JSON.stringify(bitacora.body.items)).toBeDefined();
    expect(Number(entrada!.valorAnterior!.Precio)).toBe(100);
    expect(entrada).toMatchObject({ idUsuario: idAdmin, idRegistro: idVariante });
    expect(typeof entrada!.idBitacora).toBe('number');
    expect(new Date(entrada!.fecha).toISOString()).toBe(entrada!.fecha);
  });

  it('filtra por módulo y por rango de fechas, y lista los módulos', async () => {
    // Arrange
    const modulos = await admin.get('/api/bitacora/modulos');
    expect(modulos.status).toBe(200);
    const modulo = (modulos.body as string[])[0]!;
    const hoy = new Date().toISOString().slice(0, 10);

    // Act
    const porModulo = await admin.get('/api/bitacora').query({ modulo, pageSize: 5 });
    const futuro = await admin.get('/api/bitacora').query({ desde: '2999-01-01' });
    const invertido = await admin.get('/api/bitacora').query({ desde: hoy, hasta: '2000-01-01' });

    // Assert
    expect(porModulo.body.items.length).toBeGreaterThan(0);
    for (const e of porModulo.body.items as Entrada[]) expect(e.modulo).toBe(modulo);
    expect(porModulo.body).toMatchObject({ page: 1, pageSize: 5 });
    expect(futuro.body.total).toBe(0);
    expect(invertido.status).toBe(400);
  });

  it('es de solo lectura: POST, PUT, PATCH y DELETE responden 404', async () => {
    // Arrange
    const rutas = ['/api/bitacora', '/api/bitacora/1'];

    // Act
    const respuestas = await Promise.all(
      rutas.flatMap((ruta) => [
        admin.post(ruta).send({}),
        admin.put(ruta).send({}),
        admin.patch(ruta).send({}),
        admin.delete(ruta),
      ]),
    );

    // Assert
    for (const respuesta of respuestas) expect(respuesta.status).toBe(404);
  });
});

describe('configuración', () => {
  it('GET cachea (MISS y luego HIT) y PUT actualiza, invalida y registra en bitácora', async () => {
    // Arrange
    const inicial = await admin.get('/api/configuracion');
    expect(inicial.status).toBe(200);
    const original = (inicial.body as Parametro[]).find((p) => p.clave === 'UmbralBajoStock')!;
    const nuevo = String(Number(original.valor) + 1);
    const desde = new Date().toISOString();

    try {
      // Act
      const hit = await admin.get('/api/configuracion');
      const actualizado = await admin
        .put('/api/configuracion/UmbralBajoStock')
        .send({ valor: nuevo });
      const trasPut = await admin.get('/api/configuracion');
      const trasPutHit = await admin.get('/api/configuracion');
      const bitacora = await admin.get('/api/bitacora').query({ modulo: 'Configuracion', desde });

      // Assert
      expect(hit.headers['x-cache']).toBe('HIT');
      expect(actualizado.status).toBe(200);
      expect(actualizado.body).toMatchObject({ clave: 'UmbralBajoStock', valor: nuevo });
      expect(trasPut.headers['x-cache']).toBe('MISS');
      expect((trasPut.body as Parametro[]).find((p) => p.clave === 'UmbralBajoStock')?.valor).toBe(
        nuevo,
      );
      expect(trasPutHit.headers['x-cache']).toBe('HIT');
      expect((bitacora.body.items as Entrada[]).some((e) => e.valorNuevo?.Valor === nuevo)).toBe(
        true,
      );
    } finally {
      await admin.put('/api/configuracion/UmbralBajoStock').send({ valor: original.valor });
    }
    const restaurado = await admin.get('/api/configuracion');
    expect((restaurado.body as Parametro[]).find((p) => p.clave === 'UmbralBajoStock')?.valor).toBe(
      original.valor,
    );
  });

  it.each([
    ['MinutosReserva', '0'],
    ['MinutosReserva', '121'],
    ['MinutosReserva', '1.5'],
    ['MinutosReserva', 'abc'],
    ['HorasCarritoAbandonado', '0'],
    ['HorasCarritoAbandonado', '721'],
    ['UmbralBajoStock', '-1'],
    ['UmbralBajoStock', 'abc'],
    ['PorcentajeIVA', '101'],
    ['PorcentajeIVA', '-1'],
    ['PorcentajeIVA', '12.345'],
    ['PorcentajeIVA', 'doce'],
  ])('%s con el valor "%s" → 400 VALIDACION sin cambiar el parámetro', async (clave, valor) => {
    // Arrange
    const antes = await admin.get('/api/configuracion');
    const original = (antes.body as Parametro[]).find((p) => p.clave === clave)!.valor;

    // Act
    const respuesta = await admin.put(`/api/configuracion/${clave}`).send({ valor });

    // Assert
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    const despues = await admin.get('/api/configuracion');
    expect((despues.body as Parametro[]).find((p) => p.clave === clave)?.valor).toBe(original);
  });

  it('un valor vacío → 400 VALIDACION', async () => {
    // Act
    const respuesta = await admin.put('/api/configuracion/MinutosReserva').send({ valor: '' });

    // Assert
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('una clave inexistente → 404 NO_ENCONTRADO', async () => {
    // Act
    const respuesta = await admin.put('/api/configuracion/NoExiste').send({ valor: '1' });

    // Assert
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });
});
