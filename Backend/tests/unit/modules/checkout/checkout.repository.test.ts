import sql from 'mssql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSp } from '../../../../src/db/executeSp.js';
import { checkoutRepository } from '../../../../src/modules/checkout/checkout.repository.js';
import type {
  DatosPago,
  FilaPedidoCreado,
} from '../../../../src/modules/checkout/checkout.types.js';

vi.mock('../../../../src/db/executeSp.js', () => ({ executeSp: vi.fn() }));

const CLAVE = '6f1c1d3a-0b0e-4f7b-9d1a-1d2c3b4a5e6f';

const BASE: DatosPago = {
  idDireccion: 3,
  idMetodoEnvio: 2,
  metodoPago: 'TARJETA',
  idTarjeta: null,
  titular: null,
  ultimos4: null,
  tipo: null,
  marca: null,
  guardar: false,
};

const FILA = { IDPedido: 1 } as FilaPedidoCreado;

function parametros(): { nombre: string; tipo: unknown; valor: unknown }[] {
  return vi.mocked(executeSp).mock.calls[0]![1] as never;
}

const valorDe = (nombre: string) => parametros().find((p) => p.nombre === nombre)?.valor;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(executeSp).mockResolvedValue({ filas: [FILA], resultSets: [[FILA]], returnValue: 0 });
});

describe('checkoutRepository.crearPedido', () => {
  it('con tarjeta nueva envía titular, últimos 4, tipo, marca y guardar tal cual', async () => {
    // Arrange
    const datos: DatosPago = {
      ...BASE,
      titular: 'Ana López',
      ultimos4: '4242',
      tipo: 'CREDITO',
      marca: 'VISA',
      guardar: true,
    };

    // Act
    await checkoutRepository.crearPedido(5, CLAVE, datos);

    // Assert
    expect(executeSp).toHaveBeenCalledWith('SP_Pedidos_CrearPedido', [
      { nombre: 'IDUsuarioSolicitante', tipo: sql.Int, valor: 5 },
      { nombre: 'ClaveIdempotencia', tipo: sql.UniqueIdentifier, valor: CLAVE },
      { nombre: 'IDDireccion', tipo: sql.Int, valor: 3 },
      { nombre: 'IDMetodoEnvio', tipo: sql.Int, valor: 2 },
      { nombre: 'MetodoPago', tipo: sql.NVarChar(20), valor: 'TARJETA' },
      { nombre: 'TitularTarjeta', tipo: sql.NVarChar(150), valor: 'Ana López' },
      { nombre: 'UltimosTarjeta', tipo: sql.Char(4), valor: '4242' },
      { nombre: 'IDTarjetaGuardada', tipo: sql.Int, valor: null },
      { nombre: 'TipoTarjeta', tipo: sql.NVarChar(10), valor: 'CREDITO' },
      { nombre: 'MarcaTarjeta', tipo: sql.NVarChar(20), valor: 'VISA' },
      { nombre: 'GuardarTarjeta', tipo: sql.Bit, valor: true },
    ]);
  });

  it('con tarjeta guardada envía los placeholders y el idTarjeta', async () => {
    // Arrange
    const datos: DatosPago = { ...BASE, idTarjeta: 9 };

    // Act
    await checkoutRepository.crearPedido(5, CLAVE, datos);

    // Assert
    expect(valorDe('TitularTarjeta')).toBe('Tarjeta guardada');
    expect(valorDe('UltimosTarjeta')).toBe('0001');
    expect(valorDe('IDTarjetaGuardada')).toBe(9);
    expect(valorDe('GuardarTarjeta')).toBe(false);
  });

  it('con el cuerpo anterior los parámetros nuevos van en NULL y guardar en false', async () => {
    // Arrange
    const datos: DatosPago = { ...BASE, titular: 'Ana', ultimos4: '4242' };

    // Act
    await checkoutRepository.crearPedido(5, CLAVE, datos);

    // Assert
    expect(valorDe('IDTarjetaGuardada')).toBeNull();
    expect(valorDe('TipoTarjeta')).toBeNull();
    expect(valorDe('MarcaTarjeta')).toBeNull();
    expect(valorDe('GuardarTarjeta')).toBe(false);
  });

  it('falla si el SP no devuelve el pedido', async () => {
    // Arrange
    vi.mocked(executeSp).mockResolvedValue({ filas: [], resultSets: [[]], returnValue: 0 });

    // Act & Assert
    await expect(checkoutRepository.crearPedido(5, CLAVE, BASE)).rejects.toThrow(
      'SP_Pedidos_CrearPedido',
    );
  });
});
