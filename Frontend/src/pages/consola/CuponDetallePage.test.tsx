import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cuponesApi } from '../../services/api/administracion';
import { categoriasApi } from '../../services/api/gestion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { Cupon } from '../../types/administracion';
import CuponDetallePage from './CuponDetallePage';

vi.mock('../../services/api/administracion', () => ({
  cuponesApi: {
    obtener: vi.fn(),
    usos: vi.fn(),
    actualizar: vi.fn(),
    cambiarEstado: vi.fn(),
    eliminar: vi.fn(),
  },
}));
vi.mock('../../services/api/gestion', () => ({ categoriasApi: { listar: vi.fn() } }));

const cupon: Cupon = {
  idCupon: 3,
  codigo: 'VERANO25',
  descripcion: null,
  tipoDescuento: 'PORCENTAJE',
  valor: '25.00',
  idCategoria: null,
  categoria: null,
  montoMinimo: '0.00',
  fechaInicio: '2026-11-01T06:00:00.000Z',
  fechaFin: '2026-12-01T05:59:00.000Z',
  limiteUsosTotal: 10,
  limiteUsosPorCliente: 1,
  usosActuales: 4,
  usosDisponibles: 6,
  activo: true,
  vigente: true,
  agotado: false,
  cantidadPedidos: 4,
  cantidadCarritos: 0,
  puedeEliminarse: false,
};

function abrir() {
  return renderizar(<CuponDetallePage />, {
    ruta: '/consola/cupones/3',
    patron: '/consola/cupones/:id',
  });
}

describe('CuponDetallePage', () => {
  beforeEach(() => {
    vi.mocked(cuponesApi.obtener).mockReset().mockResolvedValue(cupon);
    vi.mocked(cuponesApi.eliminar).mockReset();
    vi.mocked(cuponesApi.actualizar).mockReset();
    vi.mocked(cuponesApi.cambiarEstado).mockReset();
    vi.mocked(cuponesApi.usos)
      .mockReset()
      .mockResolvedValue({
        items: [
          {
            idUsoCupon: 1,
            idPedido: 1503,
            numeroPedido: 'SC-2026-001503',
            idUsuario: 6,
            cliente: 'Ana López',
            correo: 'ana@correo.gt',
            descuento: '29.80',
            totalPedido: '293.20',
            estadoPedido: 'ENTREGADO',
            fecha: '2026-11-03T15:31:00.000Z',
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
      });
    vi.mocked(categoriasApi.listar).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 100,
      total: 0,
    });
  });

  it('muestra los usos paginados con enlace al pedido de la consola', async () => {
    // Arrange / Act
    abrir();

    // Assert
    const enlace = await screen.findByRole('link', { name: 'SC-2026-001503' });
    expect(enlace).toHaveAttribute('href', '/consola/pedidos/1503');
    expect(cuponesApi.usos).toHaveBeenCalledWith(3, { sort: 'fecha:desc', page: 1, pageSize: 10 });
    expect(screen.getByLabelText('Código')).toHaveValue('VERANO25');
    expect(screen.getByLabelText('Inicio (hora de Guatemala)')).toHaveValue('2026-11-01T00:00');
  });

  it('bajar el límite por debajo de los usos actuales se marca en el campo', async () => {
    // Arrange
    abrir();
    const limite = await screen.findByLabelText('Límite total de usos');
    await userEvent.clear(limite);
    await userEvent.type(limite, '2');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText(/menor que los usos actuales \(4\)/)).toBeInTheDocument();
    expect(cuponesApi.actualizar).not.toHaveBeenCalled();
  });

  it('eliminar un cupón en uso (409 EN_USO) sugiere desactivarlo', async () => {
    // Arrange
    vi.mocked(cuponesApi.eliminar).mockRejectedValue(new ApiError(409, 'EN_USO', 'En uso.'));
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar cupón' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    // Assert
    await waitFor(() => expect(cuponesApi.eliminar).toHaveBeenCalledWith(3));
    expect(await screen.findByRole('alert')).toHaveTextContent('Desactívalo');
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    vi.mocked(cuponesApi.obtener).mockReturnValue(new Promise(() => undefined));

    // Act
    abrir();

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando cupón' })).toBeInTheDocument();
  });

  it('cupón inexistente (404) → NoEncontrado', async () => {
    // Arrange
    vi.mocked(cuponesApi.obtener).mockRejectedValue(
      new ApiError(404, 'NO_ENCONTRADO', 'No existe.'),
    );

    // Act
    abrir();

    // Assert
    expect(
      await screen.findByRole('heading', { name: 'Página no encontrada' }),
    ).toBeInTheDocument();
  });

  it.each(['abc', '0'])('id inválido (%s) → NoEncontrado sin llamar a la API', (id) => {
    // Act
    renderizar(<CuponDetallePage />, {
      ruta: `/consola/cupones/${id}`,
      patron: '/consola/cupones/:id',
    });

    // Assert
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(cuponesApi.obtener).not.toHaveBeenCalled();
  });

  it('error del servidor → ErrorState con requestId y Reintentar', async () => {
    // Arrange
    vi.mocked(cuponesApi.obtener)
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-71'))
      .mockResolvedValueOnce(cupon);
    abrir();
    expect(await screen.findByText('Referencia: req-71')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Cupón VERANO25' })).toBeInTheDocument();
  });

  it('muestra el estado, los usos y los pedidos tal como los da la API', async () => {
    // Act
    abrir();

    // Assert
    expect(await screen.findByText('Vigente')).toBeInTheDocument();
    expect(screen.getByText('4 de 10 usos · 4 pedido(s), 0 carrito(s)')).toBeInTheDocument();
  });

  it('llega desde el alta (state.creado) → muestra "Cupón creado."', async () => {
    // Act
    renderizar(<CuponDetallePage />, {
      ruta: '/consola/cupones/3',
      patron: '/consola/cupones/:id',
      estadoRuta: { creado: true },
    });

    // Assert
    expect(await screen.findByText('Cupón creado.')).toBeInTheDocument();
  });

  it('guardar los datos → PUT con las fechas en UTC y avisa', async () => {
    // Arrange
    vi.mocked(cuponesApi.actualizar).mockResolvedValue(cupon);
    abrir();
    const limite = await screen.findByLabelText('Límite total de usos');
    await userEvent.clear(limite);
    await userEvent.type(limite, '20');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(await screen.findByText('Cupón actualizado.')).toBeInTheDocument();
    expect(cuponesApi.actualizar).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        limiteUsosTotal: 20,
        fechaInicio: '2026-11-01T06:00:00.000Z',
        fechaFin: '2026-12-01T05:59:00.000Z',
      }),
    );
  });

  it('desactivar → confirma, envía activo false y avisa', async () => {
    // Arrange
    vi.mocked(cuponesApi.cambiarEstado).mockResolvedValue({ ...cupon, activo: false });
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar cupón' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    expect(await screen.findByText('Cupón desactivado.')).toBeInTheDocument();
    expect(cuponesApi.cambiarEstado).toHaveBeenCalledWith(3, false);
  });

  it('cupón inactivo → activar envía activo true y muestra el estado Inactivo', async () => {
    // Arrange
    vi.mocked(cuponesApi.obtener).mockResolvedValue({ ...cupon, activo: false });
    vi.mocked(cuponesApi.cambiarEstado).mockResolvedValue(cupon);
    abrir();
    expect(await screen.findByText('Inactivo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activar cupón' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    expect(await screen.findByText('Cupón activado.')).toBeInTheDocument();
    expect(cuponesApi.cambiarEstado).toHaveBeenCalledWith(3, true);
  });

  it('el cambio de estado falla → aviso con requestId', async () => {
    // Arrange
    vi.mocked(cuponesApi.cambiarEstado).mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.', [], 'req-72'),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Desactivar cupón' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
    expect(screen.getByText('Referencia: req-72')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('eliminar un cupón sin uso → lo elimina y vuelve a la lista', async () => {
    // Arrange
    vi.mocked(cuponesApi.obtener).mockResolvedValue({
      ...cupon,
      puedeEliminarse: true,
      cantidadPedidos: 0,
    });
    vi.mocked(cuponesApi.eliminar).mockResolvedValue(undefined);
    renderizar(<CuponDetallePage />, {
      ruta: '/consola/cupones/3',
      patron: '/consola/cupones/:id',
      rutas: [{ path: '/consola/cupones', element: <p>Lista de cupones</p> }],
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar cupón' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    // Assert
    expect(await screen.findByText('Lista de cupones')).toBeInTheDocument();
    expect(cuponesApi.eliminar).toHaveBeenCalledWith(3);
  });

  it('eliminar con un error distinto de EN_USO → mensaje del backend', async () => {
    // Arrange
    vi.mocked(cuponesApi.eliminar).mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'),
    );
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar cupón' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }),
    );

    // Assert
    expect(await screen.findByText('Falla del servidor.')).toBeInTheDocument();
  });

  it('cancelar el diálogo → no llama a la API', async () => {
    // Arrange
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar cupón' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(cuponesApi.eliminar).not.toHaveBeenCalled();
  });

  it('sin usos → muestra el vacío', async () => {
    // Arrange
    vi.mocked(cuponesApi.usos).mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });

    // Act
    abrir();

    // Assert
    expect(await screen.findByText('Sin usos')).toBeInTheDocument();
  });

  it('paginador de usos → "siguiente" pide la página 2', async () => {
    // Arrange
    vi.mocked(cuponesApi.usos).mockResolvedValue({
      items: [
        {
          idUsoCupon: 1,
          idPedido: 1503,
          numeroPedido: 'SC-2026-001503',
          idUsuario: 6,
          cliente: 'Ana López',
          correo: 'ana@correo.gt',
          descuento: '29.80',
          totalPedido: '293.20',
          estadoPedido: 'ENTREGADO',
          fecha: '2026-11-03T15:31:00.000Z',
        },
      ],
      page: 1,
      pageSize: 10,
      total: 25,
    });
    const { router } = abrir();
    await screen.findByRole('link', { name: 'SC-2026-001503' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    // Assert
    expect(router.state.location.search).toBe('?page=2');
    expect(cuponesApi.usos).toHaveBeenLastCalledWith(3, expect.objectContaining({ page: 2 }));
  });

  it('el descuento y el total de cada uso son los del backend', async () => {
    // Act
    abrir();

    // Assert
    expect(await screen.findByText('Q 29.80')).toBeInTheDocument();
    expect(screen.getByText('Q 293.20')).toBeInTheDocument();
  });

  it('categorías que no cargan → ErrorState en la sección de datos', async () => {
    // Arrange
    vi.mocked(categoriasApi.listar).mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla de categorías.', [], 'req-73'),
    );

    // Act
    abrir();

    // Assert
    expect(await screen.findByText('Referencia: req-73')).toBeInTheDocument();
  });
});
