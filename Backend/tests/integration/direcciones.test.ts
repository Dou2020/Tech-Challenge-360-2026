import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closePool } from '../../src/config/database.js';
import { closeRedis, connectRedis } from '../../src/config/redis.js';
import { clienteComo, clienteHttp, registrarCliente } from '../helpers/auth.js';

/*
 * Direcciones del cliente (RF-01). Semilla: el cliente 3 (cliente@shopcart.gt) tiene las
 * direcciones 1 y 2; el cliente 4 (cliente2@shopcart.gt), la 3. Las altas y bajas se hacen con un
 * cliente recién registrado para no alterar la semilla que usan otros archivos.
 */

const app = createApp();

type Http = ReturnType<typeof clienteHttp>;
let cliente: Http;
let cliente2: Http;
let nuevo: Http;

const DIRECCION_DE_CLIENTE2 = 3;

const datosDireccion = {
  alias: 'Trabajo',
  nombreDestinatario: 'Luis Pérez',
  telefono: '5555-2026',
  linea1: '7a. avenida 5-10, zona 4',
  linea2: 'Oficina 12',
  municipio: 'Guatemala',
  departamento: 'Guatemala',
  codigoPostal: '01004',
  referencias: 'Frente a la farmacia',
};

beforeAll(async () => {
  await connectRedis();
  const [a, b, c] = await Promise.all([
    clienteComo(app, 'cliente'),
    clienteComo(app, 'cliente2'),
    registrarCliente(app),
  ]);
  cliente = a.http;
  cliente2 = b.http;
  nuevo = clienteHttp(app, c);
});

afterAll(async () => {
  await Promise.all([closePool(), closeRedis()]);
});

describe('acceso', () => {
  it('sin token → 401; Operador y Administrador → 403', async () => {
    expect((await request(app).get('/api/direcciones')).status).toBe(401);
    for (const rol of ['operador', 'admin'] as const) {
      const { http } = await clienteComo(app, rol);
      const respuesta = await http.get('/api/direcciones');
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error.code).toBe('PROHIBIDO');
    }
  });
});

describe('RF-01 una dirección ajena responde 404', () => {
  it('el cliente 3 lista solo las suyas', async () => {
    const respuesta = await cliente.get('/api/direcciones');
    expect(respuesta.status).toBe(200);
    const ids = (respuesta.body as { idDireccion: number }[]).map((d) => d.idDireccion);
    expect(ids).toEqual(expect.arrayContaining([1, 2]));
    expect(ids).not.toContain(DIRECCION_DE_CLIENTE2);
  });

  it('no puede leer, editar ni borrar la dirección 3 del cliente 4', async () => {
    const ruta = `/api/direcciones/${DIRECCION_DE_CLIENTE2}`;
    for (const respuesta of [
      await cliente.get(ruta),
      await cliente.put(ruta).send(datosDireccion),
      await cliente.delete(ruta),
    ]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body.error.code).toBe('NO_ENCONTRADO');
    }

    // Sigue intacta para su dueño.
    const propia = await cliente2.get(ruta);
    expect(propia.status).toBe(200);
    expect(propia.body).toMatchObject({ idDireccion: DIRECCION_DE_CLIENTE2, alias: 'Casa' });
  });
});

describe('ciclo de vida de una dirección', () => {
  it('crear → 201 y aparece en su lista; editar; borrar → 204 y luego 404', async () => {
    expect((await nuevo.get('/api/direcciones')).body).toEqual([]);

    const creada = await nuevo.post('/api/direcciones').send(datosDireccion);
    expect(creada.status, JSON.stringify(creada.body)).toBe(201);
    expect(creada.body).toEqual({ idDireccion: expect.any(Number), ...datosDireccion });
    const id = creada.body.idDireccion as number;
    expect(creada.headers.location).toBe(`/api/direcciones/${id}`);

    const lista = await nuevo.get('/api/direcciones');
    expect(lista.body).toEqual([creada.body]);
    expect((await nuevo.get(`/api/direcciones/${id}`)).body).toEqual(creada.body);

    // Nadie más la ve.
    expect((await cliente.get(`/api/direcciones/${id}`)).status).toBe(404);

    // PUT reemplaza todo: los opcionales omitidos quedan en null.
    const editada = await nuevo.put(`/api/direcciones/${id}`).send({
      alias: '  Casa nueva ',
      nombreDestinatario: 'Luis Pérez',
      telefono: '5555-2027',
      linea1: '1a. calle 1-01, zona 1',
      municipio: 'Mixco',
      departamento: 'Guatemala',
    });
    expect(editada.status).toBe(200);
    expect(editada.body).toEqual({
      idDireccion: id,
      alias: 'Casa nueva',
      nombreDestinatario: 'Luis Pérez',
      telefono: '5555-2027',
      linea1: '1a. calle 1-01, zona 1',
      linea2: null,
      municipio: 'Mixco',
      departamento: 'Guatemala',
      codigoPostal: null,
      referencias: null,
    });

    const borrada = await nuevo.delete(`/api/direcciones/${id}`);
    expect(borrada.status).toBe(204);
    expect(borrada.text).toBe('');

    expect((await nuevo.get(`/api/direcciones/${id}`)).status).toBe(404);
    expect((await nuevo.delete(`/api/direcciones/${id}`)).status).toBe(404);
    expect((await nuevo.put(`/api/direcciones/${id}`).send(datosDireccion)).status).toBe(404);
    expect((await nuevo.get('/api/direcciones')).body).toEqual([]);
  });

  it('datos inválidos → 400 VALIDACION con el campo', async () => {
    const respuesta = await nuevo
      .post('/api/direcciones')
      .send({ ...datosDireccion, linea1: ' ', codigoPostal: '123' });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.code).toBe('VALIDACION');
    const campos = (respuesta.body.error.details as { field: string }[]).map((d) => d.field);
    expect(campos).toEqual(expect.arrayContaining(['linea1', 'codigoPostal']));

    expect((await nuevo.get('/api/direcciones/abc')).status).toBe(400);
  });
});
