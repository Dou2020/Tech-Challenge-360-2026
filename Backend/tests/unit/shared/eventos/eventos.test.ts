import { describe, expect, it, vi } from 'vitest';
import { crearEventos, type EventoPedido } from '../../../../src/shared/eventos/eventos.js';

const EVENTO: EventoPedido = {
  tipo: 'CREADO',
  idPedido: 5,
  estado: 'PAGADO',
  fecha: '2026-11-02T20:15:00.000Z',
};
const CANAL = 'shopcart:eventos:reportes';

function crearSuscriptorFalso() {
  let entrega: (mensaje: string) => void = () => undefined;
  const suscriptor = {
    isOpen: true,
    connect: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((_canal: string, oyente: (mensaje: string) => void) => {
      entrega = oyente;
      return Promise.resolve();
    }),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return { suscriptor, emitir: (mensaje: string) => entrega(mensaje) };
}

function crear(publish = vi.fn().mockResolvedValue(1)) {
  const falso = crearSuscriptorFalso();
  const duplicate = vi.fn(() => falso.suscriptor);
  const eventos = crearEventos({ publish, duplicate }, 50);
  return { eventos, publish, duplicate, ...falso };
}

describe('eventos', () => {
  it('publicar envía el evento serializado al canal', async () => {
    // Arrange
    const { eventos, publish } = crear();

    // Act
    await eventos.publicar(EVENTO);

    // Assert
    expect(publish).toHaveBeenCalledWith(CANAL, JSON.stringify(EVENTO));
  });

  it('publicar es fail-open: si Redis falla no lanza', async () => {
    // Arrange
    const { eventos } = crear(vi.fn().mockRejectedValue(new Error('Redis caído')));

    // Act
    const accion = eventos.publicar(EVENTO);

    // Assert
    await expect(accion).resolves.toBeUndefined();
  });

  it('suscribe una sola vez aunque haya varios oyentes y reparte el evento a todos', async () => {
    // Arrange
    const { eventos, duplicate, suscriptor, emitir } = crear();
    const a = vi.fn();
    const b = vi.fn();
    await Promise.all([eventos.suscribir(a), eventos.suscribir(b)]);

    // Act
    emitir(JSON.stringify(EVENTO));

    // Assert
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(suscriptor.subscribe).toHaveBeenCalledWith(CANAL, expect.any(Function));
    expect(a).toHaveBeenCalledWith(EVENTO);
    expect(b).toHaveBeenCalledWith(EVENTO);
  });

  it('cancelar la suscripción deja de entregar al oyente', async () => {
    // Arrange
    const { eventos, emitir } = crear();
    const oyente = vi.fn();
    const cancelar = await eventos.suscribir(oyente);
    cancelar();

    // Act
    emitir(JSON.stringify(EVENTO));

    // Assert
    expect(oyente).not.toHaveBeenCalled();
  });

  it('descarta un mensaje que no es JSON sin afectar a los oyentes', async () => {
    // Arrange
    const { eventos, emitir } = crear();
    const oyente = vi.fn();
    await eventos.suscribir(oyente);

    // Act
    emitir('no es json');

    // Assert
    expect(oyente).not.toHaveBeenCalled();
  });

  it('si el suscriptor no conecta lanza SERVICIO_NO_DISPONIBLE y reintenta en la siguiente', async () => {
    // Arrange
    const { eventos, suscriptor } = crear();
    suscriptor.connect.mockRejectedValueOnce(new Error('sin Redis'));

    // Act
    const primera = eventos.suscribir(vi.fn());
    await expect(primera).rejects.toMatchObject({ code: 'SERVICIO_NO_DISPONIBLE' });
    const segunda = eventos.suscribir(vi.fn());

    // Assert
    await expect(segunda).resolves.toBeTypeOf('function');
    expect(suscriptor.close).toHaveBeenCalledTimes(1);
  });

  it('si la conexión se cuelga, el tiempo de espera lanza SERVICIO_NO_DISPONIBLE', async () => {
    // Arrange
    const { eventos, suscriptor } = crear();
    suscriptor.connect.mockReturnValue(new Promise(() => undefined));

    // Act
    const accion = eventos.suscribir(vi.fn());

    // Assert
    await expect(accion).rejects.toMatchObject({ code: 'SERVICIO_NO_DISPONIBLE' });
  });

  it('cerrarSuscriptor cierra la conexión dedicada', async () => {
    // Arrange
    const { eventos, suscriptor } = crear();
    await eventos.suscribir(vi.fn());

    // Act
    await eventos.cerrarSuscriptor();

    // Assert
    expect(suscriptor.close).toHaveBeenCalledTimes(1);
  });

  it('cerrarSuscriptor y luego suscribir crea un suscriptor nuevo y descarta los oyentes viejos', async () => {
    // Arrange
    const { eventos, duplicate, emitir } = crear();
    const viejo = vi.fn();
    await eventos.suscribir(viejo);
    await eventos.cerrarSuscriptor();
    const nuevo = vi.fn();

    // Act
    await eventos.suscribir(nuevo);
    emitir(JSON.stringify(EVENTO));

    // Assert
    expect(duplicate).toHaveBeenCalledTimes(2);
    expect(nuevo).toHaveBeenCalledWith(EVENTO);
    expect(viejo).not.toHaveBeenCalled();
  });
});
