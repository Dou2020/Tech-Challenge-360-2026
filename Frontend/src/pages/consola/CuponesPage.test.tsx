import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cuponesApi } from '../../services/api/administracion';
import { userEvent } from '@testing-library/user-event';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { Cupon } from '../../types/administracion';
import CuponesPage from './CuponesPage';

vi.mock('../../services/api/administracion', () => ({ cuponesApi: { listar: vi.fn() } }));

const cupon: Cupon = {
  idCupon: 3,
  codigo: 'VERANO25',
  descripcion: null,
  tipoDescuento: 'PORCENTAJE',
  valor: '25.00',
  idCategoria: null,
  categoria: null,
  montoMinimo: '0.00',
  fechaInicio: '2026-01-01T06:00:00.000Z',
  fechaFin: '2026-02-01T06:00:00.000Z',
  limiteUsosTotal: 100,
  limiteUsosPorCliente: 1,
  usosActuales: 100,
  usosDisponibles: 0,
  activo: true,
  vigente: true,
  agotado: true,
  cantidadPedidos: 100,
  cantidadCarritos: 0,
  puedeEliminarse: false,
};

describe('CuponesPage', () => {
  beforeEach(() => {
    vi.mocked(cuponesApi.listar).mockReset();
  });

  it('envía filtros y orden de la URL y muestra el estado del cupón', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue({
      items: [cupon],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    // Act
    renderizar(<CuponesPage />, {
      ruta: '/consola/cupones?q=VER&activo=true&vigente=true&sort=usosActuales:desc',
    });

    // Assert
    const tabla = await screen.findByRole('table', { name: 'Lista de cupones' });
    expect(cuponesApi.listar).toHaveBeenCalledWith({
      q: 'VER',
      activo: 'true',
      vigente: 'true',
      sort: 'usosActuales:desc',
      page: 1,
      pageSize: 20,
    });
    expect(within(tabla).getByRole('link', { name: 'VERANO25' })).toHaveAttribute(
      'href',
      '/consola/cupones/3',
    );
    expect(within(tabla).getByText('Agotado')).toBeInTheDocument();
    expect(within(tabla).getByText('25 %')).toBeInTheDocument();
    expect(within(tabla).getByText('100 / 100')).toBeInTheDocument();
  });

  const pagina = (items: Cupon[]) => ({ items, page: 1, pageSize: 20, total: items.length });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<CuponesPage />, { ruta: '/consola/cupones' });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando lista de cupones' })).toBeInTheDocument();
  });

  it('error → ErrorState con requestId y Reintentar', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar)
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-21'))
      .mockResolvedValueOnce(pagina([cupon]));
    renderizar(<CuponesPage />, { ruta: '/consola/cupones' });
    expect(await screen.findByText('Referencia: req-21')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByRole('link', { name: 'VERANO25' })).toBeInTheDocument();
  });

  it('sin cupones ni filtros → "Aún no hay cupones"', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(pagina([]));

    // Act
    renderizar(<CuponesPage />, { ruta: '/consola/cupones' });

    // Assert
    expect(await screen.findByText('Aún no hay cupones')).toBeInTheDocument();
  });

  it('sin cupones con filtros → "Limpiar filtros" quita la URL', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(pagina([]));
    const { router } = renderizar(<CuponesPage />, { ruta: '/consola/cupones?q=zzz' });
    await screen.findByText('No hay cupones con esos filtros');

    // Act
    await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]!);

    // Assert
    expect(router.state.location.search).toBe('');
  });

  it.each([
    [
      'monto fijo → muestra el monto en quetzales',
      { tipoDescuento: 'MONTO_FIJO' as const, valor: '25.00', agotado: false },
      'Q 25.00',
    ],
    [
      'porcentaje → muestra el porcentaje',
      { tipoDescuento: 'PORCENTAJE' as const, valor: '25.00', agotado: false },
      '25 %',
    ],
  ])('%s', async (_caso, cambios, texto) => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(pagina([{ ...cupon, ...cambios }]));

    // Act
    renderizar(<CuponesPage />, { ruta: '/consola/cupones' });

    // Assert
    expect(await screen.findByText(texto)).toBeInTheDocument();
  });

  it.each([
    [{ activo: false }, 'Inactivo'],
    [{ agotado: true }, 'Agotado'],
    [{ agotado: false, vigente: true }, 'Vigente'],
    [{ agotado: false, vigente: false, fechaFin: '2026-01-01T00:00:00.000Z' }, 'Vencido'],
    [{ agotado: false, vigente: false, fechaFin: '2099-01-01T00:00:00.000Z' }, 'Próximo'],
  ])('estado del cupón %j → etiqueta %s', async (cambios, etiqueta) => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(pagina([{ ...cupon, ...cambios }]));

    // Act
    renderizar(<CuponesPage />, { ruta: '/consola/cupones' });

    // Assert
    expect(await screen.findByText(etiqueta)).toBeInTheDocument();
  });

  it('cupón con categoría → la muestra; sin categoría → "Todo el carrito"', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(
      pagina([
        cupon,
        { ...cupon, idCupon: 4, codigo: 'ROPA10', categoria: 'Ropa', idCategoria: 2 },
      ]),
    );

    // Act
    renderizar(<CuponesPage />, { ruta: '/consola/cupones' });

    // Assert
    expect(await screen.findByText('Ropa')).toBeInTheDocument();
    expect(screen.getByText('Todo el carrito')).toBeInTheDocument();
  });

  it('elegir "Dentro de fechas" → vigente=true en la URL y vuelve a la página 1', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(pagina([cupon]));
    const { router } = renderizar(<CuponesPage />, { ruta: '/consola/cupones?page=3' });
    await screen.findByRole('link', { name: 'VERANO25' });

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Fechas'), 'Dentro de fechas');

    // Assert
    expect(router.state.location.search).toBe('?vigente=true');
    expect(cuponesApi.listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ vigente: 'true', page: 1 }),
    );
  });

  it('elegir "Inactivos" en Activación → activo=false en la URL', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(pagina([cupon]));
    const { router } = renderizar(<CuponesPage />, { ruta: '/consola/cupones' });
    await screen.findByRole('link', { name: 'VERANO25' });

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Activación'), 'Inactivos');

    // Assert
    expect(router.state.location.search).toBe('?activo=false');
    expect(cuponesApi.listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ activo: 'false', page: 1 }),
    );
  });

  it('el filtro Fechas aclara que solo compara inicio y fin', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(pagina([cupon]));

    // Act
    renderizar(<CuponesPage />, { ruta: '/consola/cupones' });

    // Assert
    expect(await screen.findByLabelText('Fechas')).toHaveAccessibleDescription(
      'Solo compara la fecha de inicio y la de fin.',
    );
  });

  it('la búsqueda admite como máximo 100 caracteres (el límite de q en la API)', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(pagina([cupon]));

    // Act
    renderizar(<CuponesPage />, { ruta: '/consola/cupones' });

    // Assert
    expect(
      await screen.findByRole('searchbox', { name: 'Buscar cupón por código' }),
    ).toHaveAttribute('maxLength', '100');
  });

  it('buscar por código → q en la URL', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(pagina([cupon]));
    const { router } = renderizar(<CuponesPage />, { ruta: '/consola/cupones' });
    await screen.findByRole('link', { name: 'VERANO25' });

    // Act
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar cupón por código' }),
      'ver{Enter}',
    );

    // Assert
    expect(router.state.location.search).toBe('?q=ver');
  });

  it('el enlace de nuevo cupón lleva al alta', async () => {
    // Arrange
    vi.mocked(cuponesApi.listar).mockResolvedValue(pagina([cupon]));

    // Act
    renderizar(<CuponesPage />, { ruta: '/consola/cupones' });

    // Assert
    expect(screen.getByRole('link', { name: 'Nuevo cupón' })).toHaveAttribute(
      'href',
      '/consola/cupones/nuevo',
    );
  });
});
