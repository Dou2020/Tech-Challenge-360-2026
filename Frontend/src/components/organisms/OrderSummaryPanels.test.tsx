import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { crearPedidoDetalle } from '../../test/fixtures/pedidos';
import { OrderSummaryPanels } from './OrderSummaryPanels';

describe('OrderSummaryPanels', () => {
  it('muestra los montos del backend sin recalcular el total', () => {
    // Arrange: subtotal 298 + envío 25 = 323, pero el backend dice 310.00.
    const pedido = crearPedidoDetalle({ total: '310.00', montoIVA: '33.21' });

    // Act
    render(<OrderSummaryPanels pedido={pedido} />);

    // Assert
    expect(screen.getByText('Q 310.00')).toBeInTheDocument();
    expect(screen.getByText('Q 33.21')).toBeInTheDocument();
  });

  it('sin descuento ni reembolso → no muestra esas filas', () => {
    // Act
    render(<OrderSummaryPanels pedido={crearPedidoDetalle()} />);

    // Assert
    expect(screen.queryByText(/^Descuento/)).not.toBeInTheDocument();
    expect(screen.queryByText('Reembolsado')).not.toBeInTheDocument();
  });

  it('con descuento, cupón y reembolso → los muestra', () => {
    // Arrange
    const pedido = crearPedidoDetalle({
      descuento: '29.80',
      cupon: { idCupon: 3, codigo: 'VERANO25' },
      montoReembolsado: '100.00',
    });

    // Act
    render(<OrderSummaryPanels pedido={pedido} />);

    // Assert
    expect(screen.getByText('Descuento (VERANO25)')).toBeInTheDocument();
    expect(screen.getByText('Q 29.80')).toBeInTheDocument();
    expect(screen.getByText('Reembolsado')).toBeInTheDocument();
    expect(screen.getByText('Q 100.00')).toBeInTheDocument();
  });

  it('muestra entrega y pago', () => {
    // Act
    render(<OrderSummaryPanels pedido={crearPedidoDetalle()} />);

    // Assert
    expect(screen.getByText('Casa, 5a avenida 10-20, Mixco, Guatemala')).toBeInTheDocument();
    expect(screen.getByText('Estándar · 3 día(s) estimados')).toBeInTheDocument();
    expect(screen.getByText('TARJETA · APROBADO')).toBeInTheDocument();
    expect(screen.getByText('Referencia SIM-1')).toBeInTheDocument();
  });

  it('a domicilio → el título es "Dirección de entrega"', () => {
    // Act
    render(<OrderSummaryPanels pedido={crearPedidoDetalle()} />);

    // Assert
    expect(screen.getByRole('heading', { name: 'Dirección de entrega' })).toBeInTheDocument();
  });

  it('retiro en sucursal → el título es "Recoger en sucursal" y muestra la entrega', () => {
    // Arrange
    const pedido = crearPedidoDetalle({
      retiroEnSucursal: true,
      sucursal: { idSucursal: 3, nombre: 'Zona 10' },
      direccion: { idDireccion: null, entrega: 'Recoger en Zona 10: 6a avenida 12-34, Guatemala' },
    });

    // Act
    render(<OrderSummaryPanels pedido={pedido} />);

    // Assert
    expect(screen.getByRole('heading', { name: 'Recoger en sucursal' })).toBeInTheDocument();
    expect(screen.getByText(/Recoger en Zona 10:/)).toBeInTheDocument();
  });
});
