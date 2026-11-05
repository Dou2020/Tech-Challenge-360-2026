import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cuponesApi } from '../../services/api/administracion';
import { categoriasApi } from '../../services/api/gestion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import CuponNuevoPage from './CuponNuevoPage';

vi.mock('../../services/api/administracion', () => ({ cuponesApi: { crear: vi.fn() } }));
vi.mock('../../services/api/gestion', () => ({ categoriasApi: { listar: vi.fn() } }));

const rutas = [
  { path: '/consola/cupones', element: <p>Lista de cupones</p> },
  { path: '/consola/cupones/:id', element: <p>Detalle del cupón</p> },
];

async function llenar() {
  await userEvent.type(await screen.findByLabelText('Código'), 'nuevo-10');
  await userEvent.type(screen.getByLabelText('Valor'), '10');
  await userEvent.type(screen.getByLabelText('Inicio (hora de Guatemala)'), '2026-11-01T00:00');
  await userEvent.type(screen.getByLabelText('Fin (hora de Guatemala)'), '2026-12-01T00:00');
  await userEvent.type(screen.getByLabelText('Límite total de usos'), '5');
}

describe('CuponNuevoPage', () => {
  beforeEach(() => {
    vi.mocked(cuponesApi.crear).mockReset();
    vi.mocked(categoriasApi.listar)
      .mockReset()
      .mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
  });

  it('cargando categorías → muestra el estado de carga', () => {
    // Arrange
    vi.mocked(categoriasApi.listar).mockReturnValue(new Promise(() => undefined));

    // Act
    renderizar(<CuponNuevoPage />, { ruta: '/consola/cupones/nuevo' });

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando categorías' })).toBeInTheDocument();
  });

  it('error al cargar categorías → ErrorState con requestId y Reintentar', async () => {
    // Arrange
    vi.mocked(categoriasApi.listar)
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-61'))
      .mockResolvedValueOnce({ items: [], page: 1, pageSize: 100, total: 0 });
    renderizar(<CuponNuevoPage />, { ruta: '/consola/cupones/nuevo' });
    expect(await screen.findByText('Referencia: req-61')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByLabelText('Código')).toBeInTheDocument();
  });

  it('guardar → crea el cupón y navega a su detalle con state.creado', async () => {
    // Arrange
    vi.mocked(cuponesApi.crear).mockResolvedValue({ idCupon: 9 } as never);
    const { router } = renderizar(<CuponNuevoPage />, { ruta: '/consola/cupones/nuevo', rutas });
    await llenar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear cupón' }));

    // Assert
    expect(await screen.findByText('Detalle del cupón')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/consola/cupones/9');
    expect(router.state.location.state).toEqual({ creado: true });
    expect(cuponesApi.crear).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: 'NUEVO-10', fechaInicio: '2026-11-01T06:00:00.000Z' }),
    );
  });

  it('código repetido (409) → se queda en la página y marca el campo', async () => {
    // Arrange
    vi.mocked(cuponesApi.crear).mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Duplicado.'));
    renderizar(<CuponNuevoPage />, { ruta: '/consola/cupones/nuevo', rutas });
    await llenar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear cupón' }));

    // Assert
    expect(await screen.findByText('Ya existe un cupón con ese código.')).toBeInTheDocument();
    expect(screen.queryByText('Detalle del cupón')).not.toBeInTheDocument();
  });

  it('Cancelar → vuelve a la lista sin crear nada', async () => {
    // Arrange
    renderizar(<CuponNuevoPage />, { ruta: '/consola/cupones/nuevo', rutas });
    await screen.findByLabelText('Código');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(await screen.findByText('Lista de cupones')).toBeInTheDocument();
    expect(cuponesApi.crear).not.toHaveBeenCalled();
  });
});
