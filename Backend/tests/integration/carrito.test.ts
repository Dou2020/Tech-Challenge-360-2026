import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo, clienteHttp, registrarCliente } from '../helpers/auth.js';

/*
 * Carrito (RF-01, RF-04, RF-05). Cada prueba usa un cliente recién registrado o un invitado
 * nuevo: el carrito y los usos de cupón (BIENVENIDA10 admite 1 por cliente) no se comparten entre
 * archivos ni corridas. Semilla: variante 1 CAM-BAS-NEG-M Q89.00 ×50 (Camisetas), 4 con
 * existencia 1, 12 en 0, 13 inactiva.
 */

const app = createApp();

type Http = ReturnType<typeof clienteHttp>;

interface Item {
  idVariante: number;
  cantidad: number;
  precioUnitario: string;
  importe: string;
  descuentoLinea: string;
  importeNeto: string;
  existenciaDisponible: number;
  excedeDisponible: boolean;
  requiereAjuste: boolean;
  vendible: boolean;
}
interface Carrito {
  idCarrito: number | null;
  tokenInvitado?: string;
  items: Item[];
  cupon: {
    codigo: string;
    aplicado: boolean;
    codigoError: string | null;
  } | null;
  subtotal: string;
  descuento: string;
  total: string;
  montoIVA: string;
  cantidadLineas: number;
  cantidadUnidades: number;
}

const VARIANTE_CAMISETA = 1;
const VARIANTE_UNA_UNIDAD = 4;
const VARIANTE_SIN_EXISTENCIA = 12;
const VARIANTE_INACTIVA = 13;
const VARIANTE_INEXISTENTE = 999_999;

async function nuevoCliente(): Promise<Http> {
  return clienteHttp(app, await registrarCliente(app));
}

const agregar = (http: Http, idVariante: number, cantidad: number) =>
  http.post('/api/carrito/items').send({ idVariante, cantidad });

beforeAll(async () => {
  await connectRedis();
});

afterAll(async () => {
  await closePool();
  await closeRedis();
});

describe('Carrito de cliente', () => {
  it('un cliente sin carrito ve uno vacío con montos en cero', async () => {
    const http = await nuevoCliente();
    const respuesta = await http.get('/api/carrito');
    expect(respuesta.status).toBe(200);
    const carrito = respuesta.body as Carrito;
    expect(carrito).toMatchObject({
      idCarrito: null,
      items: [],
      cupon: null,
      subtotal: '0.00',
      total: '0.00',
    });
    expect(carrito).not.toHaveProperty('tokenInvitado');
  });

  it('agrega, suma, cambia la cantidad, quita una línea y vacía', async () => {
    const http = await nuevoCliente();

    let respuesta = await agregar(http, VARIANTE_CAMISETA, 2);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    let carrito = respuesta.body as Carrito;
    expect(carrito.idCarrito).toBeTypeOf('number');
    expect(carrito).not.toHaveProperty('tokenInvitado');
    expect(carrito.items[0]).toMatchObject({
      idVariante: VARIANTE_CAMISETA,
      cantidad: 2,
      precioUnitario: '89.00',
      importe: '178.00',
      importeNeto: '178.00',
      excedeDisponible: false,
      requiereAjuste: false,
      vendible: true,
    });
    expect(carrito).toMatchObject({
      subtotal: '178.00',
      descuento: '0.00',
      total: '178.00',
      cantidadLineas: 1,
      cantidadUnidades: 2,
    });

    carrito = (await agregar(http, VARIANTE_CAMISETA, 1)).body as Carrito;
    expect(carrito.items[0]?.cantidad).toBe(3);

    respuesta = await http.patch(`/api/carrito/items/${VARIANTE_CAMISETA}`).send({ cantidad: 1 });
    expect(respuesta.status).toBe(200);
    expect((respuesta.body as Carrito).total).toBe('89.00');

    respuesta = await http.delete(`/api/carrito/items/${VARIANTE_CAMISETA}`);
    expect(respuesta.status).toBe(200);
    expect((respuesta.body as Carrito).items).toEqual([]);

    await agregar(http, VARIANTE_CAMISETA, 2);
    respuesta = await http.delete('/api/carrito');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ items: [], total: '0.00' });
  });

  it('quitar una línea que no está en el carrito responde 404', async () => {
    const http = await nuevoCliente();
    await agregar(http, VARIANTE_CAMISETA, 1);
    const respuesta = await http.delete('/api/carrito/items/6');
    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
  });

  it('valida el body: cantidad 0 o variante inválida → 400', async () => {
    const http = await nuevoCliente();
    expect((await agregar(http, VARIANTE_CAMISETA, 0)).status).toBe(400);
    expect((await agregar(http, -1, 1)).status).toBe(400);
    const sinCantidad = await http.post('/api/carrito/items').send({ idVariante: 1 });
    expect(sinCantidad.status).toBe(400);
  });

  it('el Operador y el Administrador no tienen carrito (403)', async () => {
    for (const rol of ['operador', 'admin'] as const) {
      const { http } = await clienteComo(app, rol);
      expect((await http.get('/api/carrito')).status).toBe(403);
      expect((await agregar(http, VARIANTE_CAMISETA, 1)).status).toBe(403);
    }
  });

  it('un token inválido no degrada a invitado (401)', async () => {
    const respuesta = await request(app).get('/api/carrito').set('Authorization', 'Bearer basura');
    expect(respuesta.status).toBe(401);
  });
});

describe('RF-04: existencia', () => {
  it('agregar más de lo disponible → 409 STOCK_INSUFICIENTE con la disponible en details', async () => {
    const http = await nuevoCliente();
    const respuesta = await agregar(http, VARIANTE_UNA_UNIDAD, 2);
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('STOCK_INSUFICIENTE');
    expect(respuesta.body.error.details).toEqual([{ field: 'cantidad', message: 'Disponible: 1' }]);
  });

  it('la suma con lo que ya hay en el carrito también se controla', async () => {
    const http = await nuevoCliente();
    expect((await agregar(http, VARIANTE_UNA_UNIDAD, 1)).status).toBe(200);
    const respuesta = await agregar(http, VARIANTE_UNA_UNIDAD, 1);
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.code).toBe('STOCK_INSUFICIENTE');
  });

  it('PATCH con más de lo disponible → 409', async () => {
    const http = await nuevoCliente();
    await agregar(http, VARIANTE_UNA_UNIDAD, 1);
    const respuesta = await http
      .patch(`/api/carrito/items/${VARIANTE_UNA_UNIDAD}`)
      .send({ cantidad: 2 });
    expect(respuesta.status).toBe(409);
  });

  it('una variante sin existencia → 409', async () => {
    const http = await nuevoCliente();
    expect((await agregar(http, VARIANTE_SIN_EXISTENCIA, 1)).status).toBe(409);
  });

  it('una variante inactiva o inexistente → 404', async () => {
    const http = await nuevoCliente();
    expect((await agregar(http, VARIANTE_INACTIVA, 1)).status).toBe(404);
    expect((await agregar(http, VARIANTE_INEXISTENTE, 1)).status).toBe(404);
  });
});

describe('Carrito de invitado', () => {
  it('el primer POST sin token devuelve tokenInvitado y con él el GET trae la línea', async () => {
    const creado = await request(app)
      .post('/api/carrito/items')
      .send({ idVariante: VARIANTE_CAMISETA, cantidad: 2 });
    expect(creado.status, JSON.stringify(creado.body)).toBe(200);
    const token = (creado.body as Carrito).tokenInvitado;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);

    const leido = await request(app).get('/api/carrito').set('X-Cart-Token', token!);
    expect(leido.status).toBe(200);
    expect((leido.body as Carrito).items).toHaveLength(1);
    expect((leido.body as Carrito).idCarrito).toBe((creado.body as Carrito).idCarrito);
    expect((leido.body as Carrito).tokenInvitado).toBe(token);
  });

  it('con el token se sigue operando sobre el mismo carrito', async () => {
    const creado = await request(app)
      .post('/api/carrito/items')
      .send({ idVariante: VARIANTE_CAMISETA, cantidad: 1 });
    const token = (creado.body as Carrito).tokenInvitado!;

    const suma = await request(app)
      .post('/api/carrito/items')
      .set('X-Cart-Token', token)
      .send({ idVariante: VARIANTE_CAMISETA, cantidad: 2 });
    expect((suma.body as Carrito).items[0]?.cantidad).toBe(3);

    const vacio = await request(app).delete('/api/carrito').set('X-Cart-Token', token);
    expect(vacio.status).toBe(200);
    expect((vacio.body as Carrito).items).toEqual([]);
  });

  it('un X-Cart-Token que no es UUID → 400', async () => {
    const respuesta = await request(app).get('/api/carrito').set('X-Cart-Token', 'no-es-uuid');
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
  });

  it('GET sin token ni carrito responde un carrito vacío', async () => {
    const respuesta = await request(app).get('/api/carrito').set('X-Cart-Token', randomUUID());
    expect(respuesta.status).toBe(200);
    expect((respuesta.body as Carrito).items).toEqual([]);
  });

  it('el invitado no aplica cupón ni fusiona (401)', async () => {
    const cupon = await request(app).post('/api/carrito/cupon').send({ codigo: 'BIENVENIDA10' });
    expect(cupon.status).toBe(401);
    const quitar = await request(app).delete('/api/carrito/cupon');
    expect(quitar.status).toBe(401);
    const fusionar = await request(app).post('/api/carrito/fusionar').send({});
    expect(fusionar.status).toBe(401);
  });
});

describe('RF-01: el dueño lo decide el token', () => {
  it('el carrito de un cliente no lo ve otro cliente', async () => {
    const a = await nuevoCliente();
    const b = await nuevoCliente();
    const carritoA = (await agregar(a, VARIANTE_CAMISETA, 2)).body as Carrito;

    const vistoPorB = (await b.get('/api/carrito')).body as Carrito;
    expect(vistoPorB.items).toEqual([]);
    expect(vistoPorB.idCarrito).not.toBe(carritoA.idCarrito);
  });

  it('un cliente con el X-Cart-Token de otro carrito ve el suyo', async () => {
    const invitado = await request(app)
      .post('/api/carrito/items')
      .send({ idVariante: VARIANTE_CAMISETA, cantidad: 3 });
    const token = (invitado.body as Carrito).tokenInvitado!;

    const cliente = await nuevoCliente();
    await agregar(cliente, VARIANTE_CAMISETA, 1);
    const respuesta = await cliente.get('/api/carrito').set('X-Cart-Token', token);
    expect(respuesta.status).toBe(200);
    const carrito = respuesta.body as Carrito;
    expect(carrito.items[0]?.cantidad).toBe(1);
    expect(carrito.idCarrito).not.toBe((invitado.body as Carrito).idCarrito);
    expect(carrito).not.toHaveProperty('tokenInvitado');
  });
});

describe('RF-05: cupones en el carrito', () => {
  async function clienteConCamisetas(cantidad: number): Promise<Http> {
    const http = await nuevoCliente();
    const respuesta = await agregar(http, VARIANTE_CAMISETA, cantidad);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    return http;
  }

  it.each([
    ['VENCIDO5', 'CUPON_VENCIDO'],
    ['AGOTADO5', 'CUPON_AGOTADO'],
    ['INACTIVO5', 'CUPON_INACTIVO'],
    ['PROXIMO15', 'CUPON_NO_VIGENTE'],
    ['NO-EXISTE-XYZ', 'CUPON_NO_EXISTE'],
  ])('%s → 422 %s', async (codigo, esperado) => {
    const http = await clienteConCamisetas(1);
    const respuesta = await http.post('/api/carrito/cupon').send({ codigo });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(422);
    expect(respuesta.body.error.code).toBe(esperado);
    expect(respuesta.body.error.message).toBeTypeOf('string');
  });

  it('VERANO25 con el carrito bajo Q300 → 422 CUPON_MINIMO_NO_ALCANZADO', async () => {
    const http = await clienteConCamisetas(3); // 3 × 89.00 = 267.00
    const respuesta = await http.post('/api/carrito/cupon').send({ codigo: 'VERANO25' });
    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error.code).toBe('CUPON_MINIMO_NO_ALCANZADO');
  });

  it('VERANO25 con el mínimo cubierto baja Q25.00 el total', async () => {
    const http = await clienteConCamisetas(4); // 356.00
    const respuesta = await http.post('/api/carrito/cupon').send({ codigo: 'verano25' });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    expect(respuesta.body).toMatchObject({
      subtotal: '356.00',
      descuento: '25.00',
      total: '331.00',
    });
  });

  it('BIENVENIDA10 aplica y el total baja exactamente 10 %', async () => {
    const http = await clienteConCamisetas(2); // 178.00 → -17.80
    const respuesta = await http.post('/api/carrito/cupon').send({ codigo: 'BIENVENIDA10' });
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(200);
    const carrito = respuesta.body as Carrito;
    expect(carrito).toMatchObject({ subtotal: '178.00', descuento: '17.80', total: '160.20' });
    expect(carrito.cupon).toMatchObject({
      codigo: 'BIENVENIDA10',
      aplicado: true,
      codigoError: null,
    });
    expect(carrito.items[0]).toMatchObject({ descuentoLinea: '17.80', importeNeto: '160.20' });

    // El GET posterior conserva el cupón.
    const leido = (await http.get('/api/carrito')).body as Carrito;
    expect(leido.total).toBe('160.20');

    const sinCupon = await http.delete('/api/carrito/cupon');
    expect(sinCupon.status).toBe(200);
    expect(sinCupon.body).toMatchObject({ cupon: null, descuento: '0.00', total: '178.00' });
  });

  it('aplicar un cupón con el carrito vacío o un código vacío → 400', async () => {
    const http = await nuevoCliente();
    const vacio = await http.post('/api/carrito/cupon').send({ codigo: 'BIENVENIDA10' });
    expect(vacio.status).toBe(400);
    const sinCodigo = await http.post('/api/carrito/cupon').send({ codigo: '  ' });
    expect(sinCodigo.status).toBe(400);
  });

  it('quitar el cupón sin tenerlo no es error', async () => {
    const http = await nuevoCliente();
    expect((await http.delete('/api/carrito/cupon')).status).toBe(200);
  });
});

describe('Fusión del carrito de invitado', () => {
  it('suma las cantidades, recorta a lo disponible y no duplica al repetirse', async () => {
    const invitado = await request(app)
      .post('/api/carrito/items')
      .send({ idVariante: VARIANTE_CAMISETA, cantidad: 2 });
    const token = (invitado.body as Carrito).tokenInvitado!;
    await request(app)
      .post('/api/carrito/items')
      .set('X-Cart-Token', token)
      .send({ idVariante: VARIANTE_UNA_UNIDAD, cantidad: 1 });

    const cliente = await nuevoCliente();
    await agregar(cliente, VARIANTE_CAMISETA, 1);
    await agregar(cliente, VARIANTE_UNA_UNIDAD, 1);

    const fusion = await cliente.post('/api/carrito/fusionar').send({ tokenInvitado: token });
    expect(fusion.status, JSON.stringify(fusion.body)).toBe(200);
    const carrito = fusion.body as Carrito & {
      fusion: {
        idVariante: number;
        cantidadInvitado: number;
        cantidadAnterior: number;
        cantidadFinal: number;
        recortada: boolean;
      }[];
    };
    const camiseta = carrito.items.find((i) => i.idVariante === VARIANTE_CAMISETA);
    const unaUnidad = carrito.items.find((i) => i.idVariante === VARIANTE_UNA_UNIDAD);
    expect(camiseta?.cantidad).toBe(3);
    expect(unaUnidad?.cantidad).toBe(1); // 1 + 1 recortado a la disponible
    expect(carrito).not.toHaveProperty('tokenInvitado');
    expect(carrito.fusion).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idVariante: VARIANTE_CAMISETA,
          cantidadInvitado: 2,
          cantidadAnterior: 1,
          cantidadFinal: 3,
          recortada: false,
        }),
        expect.objectContaining({ idVariante: VARIANTE_UNA_UNIDAD, recortada: true }),
      ]),
    );

    const repetida = await cliente.post('/api/carrito/fusionar').send({ tokenInvitado: token });
    expect(repetida.status).toBe(200);
    const sinCambios = repetida.body as Carrito & { fusion: unknown[] };
    expect(sinCambios.items.find((i) => i.idVariante === VARIANTE_CAMISETA)?.cantidad).toBe(3);
    expect(sinCambios.fusion).toEqual([]);
  });

  it('toma el token del header X-Cart-Token si el body no lo trae', async () => {
    const invitado = await request(app)
      .post('/api/carrito/items')
      .send({ idVariante: VARIANTE_CAMISETA, cantidad: 2 });
    const token = (invitado.body as Carrito).tokenInvitado!;

    const cliente = await nuevoCliente();
    const fusion = await cliente.post('/api/carrito/fusionar').set('X-Cart-Token', token);
    expect(fusion.status, JSON.stringify(fusion.body)).toBe(200);
    expect((fusion.body as Carrito).items[0]?.cantidad).toBe(2);
  });

  it('sin token en body ni header → 400; token no UUID → 400', async () => {
    const cliente = await nuevoCliente();
    expect((await cliente.post('/api/carrito/fusionar').send({})).status).toBe(400);
    const malo = await cliente.post('/api/carrito/fusionar').send({ tokenInvitado: 'x' });
    expect(malo.status).toBe(400);
  });

  it('un token inexistente no es error y no cambia nada', async () => {
    const cliente = await nuevoCliente();
    const respuesta = await cliente
      .post('/api/carrito/fusionar')
      .send({ tokenInvitado: randomUUID() });
    expect(respuesta.status).toBe(200);
    expect((respuesta.body as Carrito).items).toEqual([]);
  });
});
