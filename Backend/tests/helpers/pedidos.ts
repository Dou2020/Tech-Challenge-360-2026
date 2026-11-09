/**
 * Ayudas para las pruebas de checkout y pedidos: variantes propias con la existencia que se
 * necesite (sin depender de la semilla), clientes nuevos con dirección y atajos de checkout.
 */
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { clienteHttp, registrarCliente } from './auth.js';

export type Http = ReturnType<typeof clienteHttp>;

export interface VariantePrueba {
  idProducto: number;
  idVariante: number;
  sku: string;
}

export interface ClientePrueba {
  http: Http;
  /** Access token de la sesión (para leer los streams SSE con fetch). */
  token: string;
  idUsuario: number;
  idDireccion: number;
}

const DIRECCION = {
  alias: 'Casa',
  nombreDestinatario: 'Cliente de prueba',
  telefono: '5555-2026',
  linea1: '7a. avenida 5-10, zona 4',
  municipio: 'Guatemala',
  departamento: 'Guatemala',
  codigoPostal: '01004',
};

let atributos: { talla: number; color: number } | undefined;

async function valoresAtributo(admin: Http): Promise<{ talla: number; color: number }> {
  if (atributos) return atributos;
  const respuesta = await admin.get('/api/atributos');
  expect(respuesta.status).toBe(200);
  const lista = respuesta.body as {
    nombre: string;
    valores: { idValorAtributo: number; valor: string }[];
  }[];
  const buscar = (atributo: string, valor: string): number =>
    lista.find((a) => a.nombre === atributo)!.valores.find((v) => v.valor === valor)!
      .idValorAtributo;
  atributos = { talla: buscar('Talla', 'M'), color: buscar('Color', 'Negro') };
  return atributos;
}

/** Crea un producto con una variante de la existencia y el precio indicados (como admin). */
export async function crearVariante(
  admin: Http,
  existenciaInicial: number,
  precio = '100.00',
): Promise<VariantePrueba> {
  const { talla, color } = await valoresAtributo(admin);
  const s = randomUUID().slice(0, 8).toUpperCase();
  const respuesta = await admin.post('/api/productos').send({
    idCategoria: 1,
    nombre: `Producto de pedidos ${s}`,
    descripcion: 'Creado por las pruebas de checkout y pedidos',
    variantes: [{ sku: `PED-${s}`, precio, existenciaInicial, valores: [talla, color] }],
  });
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
  const variante = (respuesta.body.variantes as { idVariante: number; sku: string }[])[0]!;
  return { idProducto: respuesta.body.idProducto as number, ...variante };
}

/** Cliente recién registrado con una dirección propia. */
export async function nuevoCliente(app: Express): Promise<ClientePrueba> {
  const sesion = await registrarCliente(app);
  const http = clienteHttp(app, sesion);
  const direccion = await http.post('/api/direcciones').send(DIRECCION);
  expect(direccion.status, JSON.stringify(direccion.body)).toBe(201);
  return {
    http,
    token: sesion.accessToken,
    idUsuario: sesion.usuario.idUsuario,
    idDireccion: direccion.body.idDireccion as number,
  };
}

async function metodosEnvio(
  app: Express,
): Promise<{ idMetodoEnvio: number; requiereSucursal: boolean }[]> {
  const respuesta = await request(app).get('/api/metodos-envio');
  expect(respuesta.status).toBe(200);
  return respuesta.body as { idMetodoEnvio: number; requiereSucursal: boolean }[];
}

/** Primer método de envío a domicilio (el de retiro en sucursal es el más barato y no sirve aquí). */
export async function metodoEnvio(app: Express): Promise<number> {
  return (await metodosEnvio(app)).find((m) => !m.requiereSucursal)!.idMetodoEnvio;
}

/** Método "Recoger en sucursal" (`requiereSucursal`). */
export async function metodoRetiro(app: Express): Promise<number> {
  return (await metodosEnvio(app)).find((m) => m.requiereSucursal)!.idMetodoEnvio;
}

/** Primera sucursal activa del catálogo público. */
export async function sucursalActiva(app: Express): Promise<number> {
  const respuesta = await request(app).get('/api/catalogo/sucursales');
  expect(respuesta.status).toBe(200);
  return (respuesta.body as { idSucursal: number }[])[0]!.idSucursal;
}

export const agregarAlCarrito = (http: Http, idVariante: number, cantidad = 1) =>
  http.post('/api/carrito/items').send({ idVariante, cantidad });

export const iniciarCheckout = (cliente: ClientePrueba, idMetodoEnvio: number) =>
  cliente.http
    .post('/api/checkout/iniciar')
    .send({ idDireccion: cliente.idDireccion, idMetodoEnvio });

export function cuerpoPago(cliente: ClientePrueba, idMetodoEnvio: number, ultimos4 = '4242') {
  return {
    idDireccion: cliente.idDireccion,
    idMetodoEnvio,
    metodoPago: 'TARJETA',
    datosPago: { titular: 'Cliente de Prueba', ultimos4 },
  };
}

export const pagar = (
  cliente: ClientePrueba,
  idMetodoEnvio: number,
  clave: string | null = randomUUID(),
  ultimos4 = '4242',
) => {
  const prueba = cliente.http.post('/api/checkout/pagar');
  if (clave !== null) void prueba.set('Idempotency-Key', clave);
  return prueba.send(cuerpoPago(cliente, idMetodoEnvio, ultimos4));
};

/** Cupón propio (código aleatorio, vigente, sin mínimo) creado como administrador. */
export async function crearCupon(
  admin: Http,
  cambios: Record<string, unknown> = {},
): Promise<{ idCupon: number; codigo: string }> {
  const respuesta = await admin.post('/api/cupones').send({
    codigo: `T${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
    descripcion: 'Cupón de las pruebas de pedidos',
    tipoDescuento: 'PORCENTAJE',
    valor: '10',
    montoMinimo: '0',
    fechaInicio: new Date(Date.now() - 86_400_000).toISOString(),
    fechaFin: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    limiteUsosTotal: 5,
    limiteUsosPorCliente: 1,
    ...cambios,
  });
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
  return respuesta.body as { idCupon: number; codigo: string };
}

/**
 * Agrega al carrito, aplica el cupón si se indica, inicia el checkout, paga y devuelve el
 * idPedido.
 */
export async function comprar(
  cliente: ClientePrueba,
  idMetodoEnvio: number,
  lineas: { idVariante: number; cantidad: number }[],
  codigoCupon?: string,
): Promise<number> {
  for (const l of lineas) {
    const r = await agregarAlCarrito(cliente.http, l.idVariante, l.cantidad);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  if (codigoCupon !== undefined) {
    const cupon = await cliente.http.post('/api/carrito/cupon').send({ codigo: codigoCupon });
    expect(cupon.status, JSON.stringify(cupon.body)).toBe(200);
    expect(cupon.body.cupon).toMatchObject({ aplicado: true });
  }
  const inicio = await iniciarCheckout(cliente, idMetodoEnvio);
  expect(inicio.status, JSON.stringify(inicio.body)).toBe(200);
  const pago = await pagar(cliente, idMetodoEnvio);
  expect(pago.status, JSON.stringify(pago.body)).toBe(201);
  return pago.body.idPedido as number;
}

/** Lleva el pedido por los estados indicados como Operador (cada paso debe responder 200). */
export async function avanzarPedido(
  operador: Http,
  idPedido: number,
  ...estados: string[]
): Promise<void> {
  for (const estado of estados) {
    const r = await operador.patch(`/api/pedidos/${idPedido}/estado`).send({ estado });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
}

/** Sucursal propia (nombre único, activa) creada como administrador, para no tocar la semilla. */
export async function crearSucursal(
  admin: Http,
  cambios: Record<string, unknown> = {},
): Promise<{ idSucursal: number; nombre: string }> {
  const respuesta = await admin.post('/api/sucursales').send({
    nombre: `Sucursal ${randomUUID().slice(0, 8)}`,
    telefono: '2222-3333',
    linea1: '5a. avenida 10-20, zona 1',
    municipio: 'Guatemala',
    departamento: 'Guatemala',
    ...cambios,
  });
  expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
  return respuesta.body as { idSucursal: number; nombre: string };
}

export const iniciarRetiro = (cliente: ClientePrueba, idMetodoEnvio: number, idSucursal: number) =>
  cliente.http.post('/api/checkout/iniciar').send({ idMetodoEnvio, idSucursal });

export const pagarRetiro = (
  cliente: ClientePrueba,
  idMetodoEnvio: number,
  idSucursal: number,
  clave: string = randomUUID(),
) =>
  cliente.http
    .post('/api/checkout/pagar')
    .set('Idempotency-Key', clave)
    .send({
      idMetodoEnvio,
      idSucursal,
      metodoPago: 'TARJETA',
      datosPago: { titular: 'Cliente de Prueba', ultimos4: '4242' },
    });

/**
 * Cliente nuevo con una variante propia en el carrito y el checkout de retiro ya iniciado
 * (la existencia queda reservada), listo para `pagarRetiro`.
 */
export async function prepararRetiro(
  app: Express,
  admin: Http,
  idSucursal: number,
  existencia = 5,
): Promise<{ cliente: ClientePrueba; variante: VariantePrueba; idMetodoEnvio: number }> {
  const [cliente, variante, idMetodoEnvio] = await Promise.all([
    nuevoCliente(app),
    crearVariante(admin, existencia),
    metodoRetiro(app),
  ]);
  const agregado = await agregarAlCarrito(cliente.http, variante.idVariante, 1);
  expect(agregado.status, JSON.stringify(agregado.body)).toBe(200);
  const inicio = await iniciarRetiro(cliente, idMetodoEnvio, idSucursal);
  expect(inicio.status, JSON.stringify(inicio.body)).toBe(200);
  return { cliente, variante, idMetodoEnvio };
}
