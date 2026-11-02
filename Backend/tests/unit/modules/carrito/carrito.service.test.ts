import { beforeEach, describe, expect, it, vi } from 'vitest';
import { carritoRepository } from '../../../../src/modules/carrito/carrito.repository.js';
import {
  armarCarrito,
  carritoService,
  conDisponible,
  elegirPropietario,
} from '../../../../src/modules/carrito/carrito.service.js';
import type {
  FilaEncabezadoCarrito,
  FilaLineaCarrito,
  ResultadoCarritoSp,
} from '../../../../src/modules/carrito/carrito.types.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';

vi.mock('../../../../src/modules/carrito/carrito.repository.js', () => ({
  carritoRepository: {
    obtener: vi.fn(),
    agregarItem: vi.fn(),
    actualizarCantidad: vi.fn(),
    eliminarItem: vi.fn(),
    vaciar: vi.fn(),
    aplicarCupon: vi.fn(),
    quitarCupon: vi.fn(),
    fusionarInvitado: vi.fn(),
  },
}));

const repo = vi.mocked(carritoRepository);
const TOKEN = '2B1F0C8E-6A3D-4F0E-9C1A-7D5E8B2F4A10';

const encabezado: FilaEncabezadoCarrito = {
  IDCarrito: 88,
  TokenInvitado: TOKEN,
  IDUsuario: null,
  IDCupon: null,
  CodigoCupon: null,
  DescripcionCupon: null,
  TipoDescuento: null,
  ValorCupon: null,
  IDCategoriaCupon: null,
  CategoriaCupon: null,
  CuponAplicado: false,
  CodigoErrorCupon: null,
  MensajeErrorCupon: null,
  CantidadLineas: 1,
  CantidadUnidades: 2,
  Subtotal: 178,
  Descuento: 0,
  Total: 178,
  PorcentajeIVA: 12,
  MontoIVA: 19.07,
  LineasRequierenAjuste: 0,
  FechaCreacion: new Date('2026-11-01T10:00:00Z'),
  FechaUltimaActividad: new Date('2026-11-01T10:00:00Z'),
};

const linea: FilaLineaCarrito = {
  IDCarritoDetalle: 1,
  IDVariante: 1,
  SKU: 'CAM-BAS-NEG-M',
  IDProducto: 1,
  Producto: 'Camiseta básica',
  IDCategoria: 2,
  Categoria: 'Camisetas',
  DescripcionVariante: 'Talla M / Negro',
  ImagenPrincipal: null,
  PrecioUnitario: 89,
  Cantidad: 2,
  Importe: 178,
  DescuentoLinea: 0,
  ImporteNeto: 178,
  ElegibleCupon: true,
  ExistenciaDisponible: 50,
  Vendible: true,
  ExcedeDisponible: false,
  RequiereAjuste: false,
  FechaAgregado: new Date('2026-11-01T10:00:00Z'),
};

const resultado = (e: Partial<FilaEncabezadoCarrito> = {}): ResultadoCarritoSp => ({
  encabezado: { ...encabezado, ...e },
  lineas: [linea],
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('elegirPropietario', () => {
  it('con usuario manda el usuario y se ignora el token', () => {
    expect(elegirPropietario(3, TOKEN)).toEqual({ idUsuario: 3 });
  });

  it('sin usuario usa el token de invitado', () => {
    expect(elegirPropietario(undefined, TOKEN)).toEqual({ tokenInvitado: TOKEN });
  });

  it('sin usuario ni token pasa null (el SP crea un carrito nuevo)', () => {
    expect(elegirPropietario(undefined, undefined)).toEqual({ tokenInvitado: null });
  });
});

describe('armarCarrito', () => {
  it('da formato a montos, fechas y banderas', () => {
    const carrito = armarCarrito(resultado(), true);
    expect(carrito).toMatchObject({
      idCarrito: 88,
      subtotal: '178.00',
      descuento: '0.00',
      total: '178.00',
      porcentajeIVA: '12.00',
      montoIVA: '19.07',
      cantidadLineas: 1,
      cantidadUnidades: 2,
      lineasRequierenAjuste: 0,
      cupon: null,
    });
    expect(carrito.items[0]).toMatchObject({
      sku: 'CAM-BAS-NEG-M',
      variante: 'Talla M / Negro',
      precioUnitario: '89.00',
      importe: '178.00',
      descuentoLinea: '0.00',
      importeNeto: '178.00',
      existenciaDisponible: 50,
      excedeDisponible: false,
      requiereAjuste: false,
      vendible: true,
      fechaAgregado: '2026-11-01T10:00:00.000Z',
    });
  });

  it('entrega tokenInvitado en minúsculas solo a invitados', () => {
    expect(armarCarrito(resultado(), true).tokenInvitado).toBe(TOKEN.toLowerCase());
    expect(armarCarrito(resultado(), false)).not.toHaveProperty('tokenInvitado');
  });

  it('un carrito inexistente llega vacío con idCarrito null', () => {
    const carrito = armarCarrito(
      {
        encabezado: { ...encabezado, IDCarrito: null, TokenInvitado: null, Subtotal: 0 },
        lineas: [],
      },
      true,
    );
    expect(carrito.idCarrito).toBeNull();
    expect(carrito.items).toEqual([]);
    expect(carrito).not.toHaveProperty('tokenInvitado');
  });

  it('un cupón vigente se expone aplicado, sin error', () => {
    const carrito = armarCarrito(
      resultado({
        IDCupon: 1,
        CodigoCupon: 'BIENVENIDA10',
        TipoDescuento: 'PORCENTAJE',
        ValorCupon: 10,
        CuponAplicado: true,
        Descuento: 17.8,
        Total: 160.2,
      }),
      false,
    );
    expect(carrito.cupon).toMatchObject({
      codigo: 'BIENVENIDA10',
      tipoDescuento: 'PORCENTAJE',
      valor: '10.00',
      aplicado: true,
      codigoError: null,
    });
    expect(carrito.descuento).toBe('17.80');
    expect(carrito.total).toBe('160.20');
  });

  it('un cupón que ya no vale lleva el código del catálogo y el mensaje', () => {
    const carrito = armarCarrito(
      resultado({
        IDCupon: 2,
        CodigoCupon: 'VERANO25',
        CuponAplicado: false,
        CodigoErrorCupon: 50066,
        MensajeErrorCupon: 'Falta el mínimo.',
      }),
      false,
    );
    expect(carrito.cupon).toMatchObject({
      aplicado: false,
      codigoError: 'CUPON_MINIMO_NO_ALCANZADO',
      mensajeError: 'Falta el mínimo.',
    });
  });
});

describe('conDisponible', () => {
  it('copia la cifra del mensaje de 50030 a details', () => {
    const error = conDisponible(
      new AppError('STOCK_INSUFICIENTE', 'Solo hay 1 unidad(es) disponible(s) de CAM-LIM-NEG-M.'),
    ) as AppError;
    expect(error.code).toBe('STOCK_INSUFICIENTE');
    expect(error.details).toEqual([{ field: 'cantidad', message: 'Disponible: 1' }]);
  });

  it('deja pasar otros errores sin cambios', () => {
    const otro = new AppError('NO_ENCONTRADO', 'No existe.');
    expect(conDisponible(otro)).toBe(otro);
  });
});

describe('carritoService', () => {
  it('agregarItem traduce STOCK_INSUFICIENTE con la disponible en details', async () => {
    repo.agregarItem.mockRejectedValue(
      new AppError('STOCK_INSUFICIENTE', 'Solo hay 0 unidad(es) disponible(s) de X.'),
    );
    await expect(carritoService.agregarItem({ idUsuario: 3 }, 12, 1)).rejects.toMatchObject({
      status: 409,
      details: [{ field: 'cantidad', message: 'Disponible: 0' }],
    });
  });

  it('pasa al repositorio el dueño elegido y arma la respuesta', async () => {
    repo.obtener.mockResolvedValue(resultado());
    const carrito = await carritoService.obtener({ tokenInvitado: TOKEN });
    expect(repo.obtener).toHaveBeenCalledWith({ tokenInvitado: TOKEN });
    expect(carrito.tokenInvitado).toBe(TOKEN.toLowerCase());
  });

  it('fusionar usa el token del body y, si falta, el del header; sin ninguno, 400', async () => {
    repo.fusionarInvitado.mockResolvedValue({
      ...resultado({ IDUsuario: 3 }),
      fusion: [
        {
          IDVariante: 1,
          SKU: 'CAM-BAS-NEG-M',
          CantidadInvitado: 2,
          CantidadAnterior: 1,
          CantidadFinal: 3,
          CantidadAgregada: 2,
          Recortada: false,
        },
      ],
    });
    const deBody = await carritoService.fusionar(3, TOKEN, 'otro');
    expect(repo.fusionarInvitado).toHaveBeenLastCalledWith(3, TOKEN.toLowerCase());
    expect(deBody).not.toHaveProperty('tokenInvitado');
    expect(deBody.fusion[0]).toMatchObject({ cantidadFinal: 3, recortada: false });

    await carritoService.fusionar(3, undefined, 'abc');
    expect(repo.fusionarInvitado).toHaveBeenLastCalledWith(3, 'abc');

    await expect(carritoService.fusionar(3, undefined, undefined)).rejects.toMatchObject({
      code: 'VALIDACION',
    });
  });
});
