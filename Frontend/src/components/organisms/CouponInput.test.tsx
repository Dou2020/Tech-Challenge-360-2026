import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderizar } from '../../test/renderizar';
import type { CuponCarrito } from '../../types/carrito';
import { CouponInput } from './CouponInput';

function cupon(parcial: Partial<CuponCarrito> = {}): CuponCarrito {
  return {
    idCupon: 3,
    codigo: 'VERANO25',
    descripcion: null,
    tipoDescuento: 'PORCENTAJE',
    valor: '25.00',
    idCategoria: null,
    categoria: null,
    aplicado: true,
    codigoError: null,
    mensajeError: null,
    ...parcial,
  };
}

const acciones = { onAplicar: vi.fn(), onQuitar: vi.fn() };

describe('CouponInput', () => {
  it('invitado → invita a iniciar sesión y no muestra el campo', () => {
    // Act
    renderizar(<CouponInput cupon={null} esCliente={false} {...acciones} />);

    // Assert
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toHaveAttribute(
      'href',
      '/login?redirect=/carrito',
    );
    expect(screen.queryByLabelText('Código de cupón')).not.toBeInTheDocument();
  });

  it('enviar el código → lo manda sin espacios sobrantes', async () => {
    // Arrange
    const onAplicar = vi.fn();
    renderizar(<CouponInput cupon={null} esCliente onAplicar={onAplicar} onQuitar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Código de cupón'), '  VERANO25 ');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    // Assert
    expect(onAplicar).toHaveBeenCalledWith('VERANO25');
  });

  it('código vacío → no llama a onAplicar', async () => {
    // Arrange
    const onAplicar = vi.fn();
    renderizar(<CouponInput cupon={null} esCliente onAplicar={onAplicar} onQuitar={vi.fn()} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    // Assert
    expect(onAplicar).not.toHaveBeenCalled();
  });

  it('error del backend → muestra el mensaje exacto en el campo', () => {
    // Act
    renderizar(
      <CouponInput
        cupon={null}
        esCliente
        error="El cupón VERANO25 requiere una compra mínima de Q300.00; tu carrito suma Q298.00."
        {...acciones}
      />,
    );

    // Assert
    expect(screen.getByLabelText('Código de cupón')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/requiere una compra mínima de Q300.00/)).toBeInTheDocument();
  });

  it('cupón aplicado → lo indica con su código', () => {
    // Act
    renderizar(<CouponInput cupon={cupon()} esCliente {...acciones} />);

    // Assert
    expect(screen.getByText('VERANO25')).toBeInTheDocument();
    expect(screen.getByText(/aplicado/)).toBeInTheDocument();
  });

  it('cupón guardado con aplicado false → muestra su mensajeError', () => {
    // Act
    renderizar(
      <CouponInput
        cupon={cupon({
          aplicado: false,
          codigoError: 'CUPON_VENCIDO',
          mensajeError: 'El cupón VERANO25 venció el 30/9/2026.',
        })}
        esCliente
        {...acciones}
      />,
    );

    // Assert
    expect(screen.getByText(/no aplicado/)).toBeInTheDocument();
    expect(screen.getByText('El cupón VERANO25 venció el 30/9/2026.')).toBeInTheDocument();
  });

  it('clic en Quitar cupón → llama a onQuitar', async () => {
    // Arrange
    const onQuitar = vi.fn();
    renderizar(<CouponInput cupon={cupon()} esCliente onAplicar={vi.fn()} onQuitar={onQuitar} />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Quitar cupón' }));

    // Assert
    expect(onQuitar).toHaveBeenCalledTimes(1);
  });

  it('cargando → deshabilita Aplicar y Quitar cupón', () => {
    // Act
    renderizar(<CouponInput cupon={cupon()} esCliente cargando {...acciones} />);

    // Assert
    expect(screen.getByRole('button', { name: 'Quitar cupón' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Aplicar/ })).toBeDisabled();
  });
});
