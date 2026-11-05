import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { Cupon } from '../../types/administracion';
import type { CategoriaGestion } from '../../types/gestion';
import { CouponForm } from './CouponForm';

const categorias: CategoriaGestion[] = [
  {
    idCategoria: 2,
    nombre: 'Ropa',
    descripcion: null,
    activo: true,
    cantidadProductos: 1,
    cantidadCupones: 0,
  },
  {
    idCategoria: 3,
    nombre: 'Viejo',
    descripcion: null,
    activo: false,
    cantidadProductos: 0,
    cantidadCupones: 0,
  },
];

const cupon: Cupon = {
  idCupon: 3,
  codigo: 'VERANO25',
  descripcion: 'Verano',
  tipoDescuento: 'MONTO_FIJO',
  valor: '25.00',
  idCategoria: 2,
  categoria: 'Ropa',
  montoMinimo: '100.00',
  fechaInicio: '2026-11-01T06:00:00.000Z',
  fechaFin: '2026-12-01T05:59:00.000Z',
  limiteUsosTotal: 10,
  limiteUsosPorCliente: 2,
  usosActuales: 4,
  usosDisponibles: 6,
  activo: true,
  vigente: true,
  agotado: false,
  cantidadPedidos: 4,
  cantidadCarritos: 0,
  puedeEliminarse: false,
};

function montar(props: Partial<Parameters<typeof CouponForm>[0]> = {}) {
  const acciones = { onGuardar: vi.fn().mockResolvedValue(undefined), onCancelar: vi.fn() };
  renderizar(<CouponForm categorias={categorias} {...acciones} {...props} />);
  return acciones;
}

async function llenarNuevo() {
  await userEvent.type(screen.getByLabelText('Código'), 'nuevo-10');
  await userEvent.type(screen.getByLabelText('Valor'), '10');
  await userEvent.type(screen.getByLabelText('Inicio (hora de Guatemala)'), '2026-11-01T00:00');
  await userEvent.type(screen.getByLabelText('Fin (hora de Guatemala)'), '2026-12-01T00:00');
  await userEvent.type(screen.getByLabelText('Límite total de usos'), '5');
}

describe('CouponForm', () => {
  it('crear → envía el código en mayúsculas y las fechas de Guatemala como UTC', async () => {
    // Arrange
    const { onGuardar } = montar();
    await llenarNuevo();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear cupón' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({
        codigo: 'NUEVO-10',
        tipoDescuento: 'PORCENTAJE',
        valor: '10',
        montoMinimo: '0',
        fechaInicio: '2026-11-01T06:00:00.000Z',
        fechaFin: '2026-12-01T06:00:00.000Z',
        limiteUsosTotal: 5,
        limiteUsosPorCliente: 1,
      }),
    );
  });

  it('crear con categoría y tipo monto fijo → los envía', async () => {
    // Arrange
    const { onGuardar } = montar();
    await llenarNuevo();
    await userEvent.selectOptions(screen.getByLabelText('Tipo de descuento'), 'Monto fijo (Q)');
    await userEvent.selectOptions(screen.getByLabelText('Categoría (opcional)'), 'Ropa');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear cupón' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith(
        expect.objectContaining({ tipoDescuento: 'MONTO_FIJO', idCategoria: 2 }),
      ),
    );
  });

  it('la lista de categorías marca las inactivas', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByRole('option', { name: 'Viejo (inactiva)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Todo el carrito' })).toBeInTheDocument();
  });

  it('formulario vacío → errores por campo con aria-invalid y sin guardar', async () => {
    // Arrange
    const { onGuardar } = montar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear cupón' }));

    // Assert
    expect(await screen.findByText('Ingresa el código.')).toBeInTheDocument();
    expect(screen.getByText('Indica la fecha de inicio.')).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toHaveAttribute('aria-invalid', 'true');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('porcentaje mayor que 100 → error en el valor', async () => {
    // Arrange
    const { onGuardar } = montar();
    await llenarNuevo();
    await userEvent.clear(screen.getByLabelText('Valor'));
    await userEvent.type(screen.getByLabelText('Valor'), '150');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear cupón' }));

    // Assert
    expect(await screen.findByText('Un porcentaje no pasa de 100.')).toBeInTheDocument();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('editar → precarga los datos y muestra las fechas en hora de Guatemala', () => {
    // Act
    montar({ cupon });

    // Assert
    expect(screen.getByLabelText('Código')).toHaveValue('VERANO25');
    expect(screen.getByLabelText('Tipo de descuento')).toHaveValue('MONTO_FIJO');
    expect(screen.getByLabelText('Categoría (opcional)')).toHaveValue('2');
    expect(screen.getByLabelText('Inicio (hora de Guatemala)')).toHaveValue('2026-11-01T00:00');
    expect(screen.getByLabelText('Fin (hora de Guatemala)')).toHaveValue('2026-11-30T23:59');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('editar y guardar sin cambios → reenvía las mismas fechas en UTC', async () => {
    // Arrange
    const { onGuardar } = montar({ cupon });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    await waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith(
        expect.objectContaining({
          codigo: 'VERANO25',
          fechaInicio: '2026-11-01T06:00:00.000Z',
          fechaFin: '2026-12-01T05:59:00.000Z',
          limiteUsosTotal: 10,
        }),
      ),
    );
  });

  it('editar con límite por debajo de los usos actuales → error en el campo sin llamar a onGuardar', async () => {
    // Arrange
    const { onGuardar } = montar({ cupon });
    const limite = screen.getByLabelText('Límite total de usos');
    await userEvent.clear(limite);
    await userEvent.type(limite, '3');
    const porCliente = screen.getByLabelText('Límite de usos por cliente');
    await userEvent.clear(porCliente);
    await userEvent.type(porCliente, '1');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    expect(
      await screen.findByText('No puede ser menor que los usos actuales (4).'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Límite total de usos')).toHaveAttribute('aria-invalid', 'true');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('409 DUPLICADO → mensaje en el código', async () => {
    // Arrange
    montar({ onGuardar: vi.fn().mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Duplicado.')) });
    await llenarNuevo();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear cupón' }));

    // Assert
    expect(await screen.findByText('Ya existe un cupón con ese código.')).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toHaveAttribute('aria-invalid', 'true');
  });

  it('details del backend → cada mensaje queda en su campo', async () => {
    // Arrange
    montar({
      onGuardar: vi
        .fn()
        .mockRejectedValue(
          new ApiError(400, 'VALIDACION', 'Inválido', [
            { field: 'valor', message: 'Valor no permitido.' },
          ]),
        ),
    });
    await llenarNuevo();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear cupón' }));

    // Assert
    expect(await screen.findByText('Valor no permitido.')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    [new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.'), 'Falla del servidor.'],
    [new Error('red'), 'No se pudo guardar el cupón.'],
  ])('otro error (%#) → alerta', async (error, mensaje) => {
    // Arrange
    montar({ onGuardar: vi.fn().mockRejectedValue(error) });
    await llenarNuevo();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear cupón' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje);
  });

  it('sin onCancelar → no muestra Cancelar; con onCancelar → lo llama', async () => {
    // Arrange
    const onCancelar = vi.fn();
    renderizar(<CouponForm categorias={categorias} onGuardar={vi.fn()} onCancelar={onCancelar} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
