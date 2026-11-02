import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../../src/config/logger.js';
import {
  detenerJobLiberarReservas,
  ejecutarLiberacionReservas,
  iniciarJobLiberarReservas,
} from '../../../src/jobs/liberarReservas.job.js';
import { inventarioService } from '../../../src/modules/inventario/inventario.service.js';
import type { ResultadoLiberacion } from '../../../src/modules/inventario/inventario.types.js';

vi.mock('../../../src/modules/inventario/inventario.service.js', () => ({
  inventarioService: { liberarReservasVencidas: vi.fn() },
}));

const liberar = vi.mocked(inventarioService.liberarReservasVencidas);
const NADA: ResultadoLiberacion = {
  reservasLiberadas: 0,
  unidadesLiberadas: 0,
  variantesAfectadas: 0,
};

/** Promesa que se resuelve a mano, para simular una pasada lenta. */
function diferida<T>() {
  let resolver!: (valor: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await detenerJobLiberarReservas();
  vi.useRealTimers();
});

describe('ejecutarLiberacionReservas', () => {
  it('omite la pasada si la anterior sigue en curso', async () => {
    const lenta = diferida<ResultadoLiberacion>();
    liberar.mockReturnValueOnce(lenta.promesa);

    const primera = ejecutarLiberacionReservas();
    const segunda = await ejecutarLiberacionReservas();

    expect(segunda).toBeNull();
    expect(liberar).toHaveBeenCalledTimes(1);

    lenta.resolver(NADA);
    expect(await primera).toEqual(NADA);

    // Terminada la anterior, la siguiente sí corre.
    liberar.mockResolvedValueOnce(NADA);
    expect(await ejecutarLiberacionReservas()).toEqual(NADA);
    expect(liberar).toHaveBeenCalledTimes(2);
  });

  it('un error queda en el log y no se propaga; la siguiente pasada vuelve a intentar', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    liberar.mockRejectedValueOnce(new Error('SQL Server no responde'));

    await expect(ejecutarLiberacionReservas()).resolves.toBeNull();
    expect(error).toHaveBeenCalledOnce();

    liberar.mockResolvedValueOnce(NADA);
    await expect(ejecutarLiberacionReservas()).resolves.toEqual(NADA);
  });

  it('registra en info solo si liberó algo', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

    liberar.mockResolvedValueOnce(NADA);
    await ejecutarLiberacionReservas();
    expect(info).not.toHaveBeenCalled();

    const liberado = { reservasLiberadas: 2, unidadesLiberadas: 3, variantesAfectadas: 1 };
    liberar.mockResolvedValueOnce(liberado);
    await ejecutarLiberacionReservas();
    expect(info).toHaveBeenCalledWith(liberado, 'Reservas vencidas liberadas');
  });
});

describe('iniciarJobLiberarReservas y detenerJobLiberarReservas', () => {
  it('ejecuta una pasada por intervalo, no duplica el intervalo y se detiene', async () => {
    vi.useFakeTimers();
    liberar.mockResolvedValue(NADA);

    iniciarJobLiberarReservas(1_000);
    iniciarJobLiberarReservas(1_000);
    expect(liberar).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(liberar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(liberar).toHaveBeenCalledTimes(3);

    await detenerJobLiberarReservas();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(liberar).toHaveBeenCalledTimes(3);
  });

  it('detener espera la pasada en curso', async () => {
    vi.useFakeTimers();
    const lenta = diferida<ResultadoLiberacion>();
    liberar.mockReturnValueOnce(lenta.promesa);

    iniciarJobLiberarReservas(1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    let detenido = false;
    const deteniendo = detenerJobLiberarReservas().then(() => {
      detenido = true;
    });
    await Promise.resolve();
    expect(detenido).toBe(false);

    lenta.resolver(NADA);
    await deteniendo;
    expect(detenido).toBe(true);
  });
});
