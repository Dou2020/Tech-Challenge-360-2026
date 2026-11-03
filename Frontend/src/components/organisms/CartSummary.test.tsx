import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { crearCarrito } from '../../test/fixtures/carrito';
import { CartSummary } from './CartSummary';

describe('CartSummary', () => {
  it('muestra subtotal, total e IVA del backend sin recalcular', () => {
    // Arrange: el total no es subtotal − descuento, para detectar un recálculo.
    const carrito = crearCarrito({
      subtotal: '298.00',
      descuento: '0.00',
      total: '271.50',
      montoIVA: '29.09',
      cantidadUnidades: 3,
    });

    // Act
    render(<CartSummary carrito={carrito} />);

    // Assert
    expect(screen.getByText('Subtotal (3 unidades)')).toBeInTheDocument();
    expect(screen.getByText('Q 298.00')).toBeInTheDocument();
    expect(screen.getByText('Q 271.50')).toBeInTheDocument();
    expect(screen.getByText('Q 29.09')).toBeInTheDocument();
    expect(screen.getByText('IVA incluido (12 %)')).toBeInTheDocument();
  });

  it('sin descuento → no muestra la fila de descuento', () => {
    // Act
    render(<CartSummary carrito={crearCarrito()} />);

    // Assert
    expect(screen.queryByText(/^Descuento/)).not.toBeInTheDocument();
  });

  it('descuento con cupón aplicado → lo muestra con el código', () => {
    // Arrange
    const carrito = crearCarrito({
      descuento: '74.50',
      total: '223.50',
      cupon: {
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
      },
    });

    // Act
    render(<CartSummary carrito={carrito} />);

    // Assert
    expect(screen.getByText('Descuento (VERANO25)')).toBeInTheDocument();
    expect(screen.getByText('Q 74.50')).toBeInTheDocument();
  });

  it('con hijos → los muestra bajo los montos', () => {
    // Act
    render(
      <CartSummary carrito={crearCarrito()}>
        <button type="button">Ir a pagar</button>
      </CartSummary>,
    );

    // Assert
    expect(screen.getByRole('button', { name: 'Ir a pagar' })).toBeInTheDocument();
  });
});
