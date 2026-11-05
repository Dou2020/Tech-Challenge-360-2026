import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bitacoraApi } from '../../services/api/administracion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import BitacoraPage from './BitacoraPage';

vi.mock('../../services/api/administracion', () => ({
  bitacoraApi: { listar: vi.fn(), modulos: vi.fn() },
}));
const api = vi.mocked(bitacoraApi);

describe('BitacoraPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.modulos.mockResolvedValue(['Inventario', 'Catalogo']);
    api.listar.mockResolvedValue({
      items: [
        {
          idBitacora: 90,
          idUsuario: 1,
          usuario: 'Ada Admin',
          correoUsuario: 'admin@shopcart.gt',
          modulo: 'Inventario',
          entidad: 'Variante',
          idRegistro: 41,
          accion: 'MODIFICAR',
          valorAnterior: { Precio: 149.5 },
          valorNuevo: { Precio: 159.5 },
          fecha: '2026-11-03T15:30:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it('envía los filtros de la URL y muestra los valores anterior y nuevo', async () => {
    // Arrange / Act
    renderizar(<BitacoraPage />, {
      ruta: '/consola/bitacora?modulo=Inventario&entidad=Variante&idRegistro=41&idUsuario=1&accion=MODIFICAR&desde=2026-11-01&hasta=2026-11-30',
    });

    // Assert
    const tabla = await screen.findByRole('table', { name: 'Registros de la bitácora' });
    expect(api.listar).toHaveBeenCalledWith({
      modulo: 'Inventario',
      entidad: 'Variante',
      idRegistro: '41',
      idUsuario: '1',
      accion: 'MODIFICAR',
      desde: '2026-11-01',
      hasta: '2026-11-30',
      sort: 'fecha:desc',
      page: 1,
      pageSize: 20,
    });
    expect(within(tabla).getByText('Variante #41')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Catalogo' })).toBeInTheDocument();
  });

  it('cada fila despliega el detalle campo por campo', async () => {
    // Arrange
    renderizar(<BitacoraPage />, { ruta: '/consola/bitacora' });
    await userEvent.click(await screen.findByText('Ver cambios'));

    // Act
    const detalle = screen.getByRole('cell', { name: 'Precio' }).closest('tr') as HTMLElement;

    // Assert
    expect(within(detalle).getByText('149.5')).toBeInTheDocument();
    expect(within(detalle).getByText('159.5')).toBeInTheDocument();
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    api.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<BitacoraPage />, { ruta: '/consola/bitacora' });

    // Assert
    expect(
      screen.getByRole('status', { name: 'Cargando registros de la bitácora' }),
    ).toBeInTheDocument();
  });

  it('error → ErrorState con requestId y Reintentar', async () => {
    // Arrange
    api.listar
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-41'))
      .mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, total: 0 });
    renderizar(<BitacoraPage />, { ruta: '/consola/bitacora' });
    expect(await screen.findByText('Referencia: req-41')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByText('La bitácora está vacía')).toBeInTheDocument();
  });

  it('sin registros y sin filtros → "La bitácora está vacía"', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    // Act
    renderizar(<BitacoraPage />, { ruta: '/consola/bitacora' });

    // Assert
    expect(await screen.findByText('La bitácora está vacía')).toBeInTheDocument();
  });

  it('sin registros con filtros → lo dice y "Limpiar filtros" quita la URL', async () => {
    // Arrange
    api.listar.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const { router } = renderizar(<BitacoraPage />, {
      ruta: '/consola/bitacora?modulo=Inventario',
    });
    await screen.findByText('No hay registros con esos filtros');

    // Act
    await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]!);

    // Assert
    expect(router.state.location.search).toBe('');
  });

  it('rango invertido → muestra el error y no manda las fechas', async () => {
    // Act
    renderizar(<BitacoraPage />, { ruta: '/consola/bitacora?desde=2026-11-30&hasta=2026-11-01' });

    // Assert
    expect(
      await screen.findByText('Debe ser igual o posterior a la fecha inicial.'),
    ).toBeInTheDocument();
    expect(api.listar).toHaveBeenCalledWith({ sort: 'fecha:desc', page: 1, pageSize: 20 });
  });

  it('cambiar el módulo → módulo en la URL y vuelve a la página 1', async () => {
    // Arrange
    const { router } = renderizar(<BitacoraPage />, { ruta: '/consola/bitacora?page=2' });
    await screen.findByText('Variante #41');
    await screen.findByRole('option', { name: 'Catalogo' });

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Módulo'), 'Catalogo');

    // Assert
    expect(router.state.location.search).toBe('?modulo=Catalogo');
    expect(api.listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ modulo: 'Catalogo', page: 1 }),
    );
  });

  it('escribir una entidad → entidad en la URL', async () => {
    // Arrange
    const { router } = renderizar(<BitacoraPage />, { ruta: '/consola/bitacora' });
    await screen.findByText('Variante #41');

    // Act
    await userEvent.type(screen.getByLabelText('Entidad'), 'Cupon');

    // Assert
    expect(router.state.location.search).toBe('?entidad=Cupon');
  });

  it('el encabezado de módulo ordena con sort en la URL', async () => {
    // Arrange
    const { router } = renderizar(<BitacoraPage />, { ruta: '/consola/bitacora' });
    await screen.findByText('Variante #41');

    // Act
    await userEvent.click(screen.getByRole('button', { name: /Módulo/ }));

    // Assert
    expect(router.state.location.search).toBe('?sort=modulo%3Aasc');
  });

  it('registro sin valores anterior ni nuevo → "Sin detalle"', async () => {
    // Arrange
    api.listar.mockResolvedValue({
      items: [
        {
          idBitacora: 91,
          idUsuario: 1,
          usuario: 'Ada Admin',
          correoUsuario: 'admin@shopcart.gt',
          modulo: 'Auth',
          entidad: 'Usuario',
          idRegistro: 1,
          accion: 'LOGIN',
          valorAnterior: null,
          valorNuevo: null,
          fecha: '2026-11-03T15:30:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    // Act
    renderizar(<BitacoraPage />, { ruta: '/consola/bitacora' });

    // Assert
    expect(await screen.findByText('Sin detalle')).toBeInTheDocument();
  });

  it.each([
    ['ID del registro', '41', '?idRegistro=41'],
    ['ID del usuario', '7', '?idUsuario=7'],
    ['Acción', 'CREAR', '?accion=CREAR'],
    ['Desde', '2026-11-01', '?desde=2026-11-01'],
    ['Hasta', '2026-11-30', '?hasta=2026-11-30'],
  ])('escribir en "%s" → lo pone en la URL', async (etiqueta, valor, esperado) => {
    // Arrange
    const { router } = renderizar(<BitacoraPage />, { ruta: '/consola/bitacora' });
    await screen.findByText('Variante #41');

    // Act
    await userEvent.type(screen.getByLabelText(etiqueta), valor);

    // Assert
    expect(router.state.location.search).toBe(esperado);
  });
});
