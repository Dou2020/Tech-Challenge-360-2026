import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DevolucionPedido } from '../../types/pedidos';
import { ReturnsList } from './ReturnsList';

function devolucion(parcial: Partial<DevolucionPedido> = {}): DevolucionPedido {
  return {
    idDevolucion: 1,
    tipo: 'PARCIAL',
    motivo: 'Talla incorrecta',
    montoReembolso: '149.00',
    usuario: 'Omar Pérez',
    fecha: '2026-11-10T16:00:00.000Z',
    lineas: [
      {
        idPedidoDetalle: 3021,
        sku: 'CAM-LIM-NEG-M',
        nombreProducto: 'Camiseta',
        cantidad: 1,
        montoReembolso: '149.00',
      },
    ],
    ...parcial,
  };
}

describe('ReturnsList', () => {
  it('sin devoluciones → no renderiza nada', () => {
    // Act
    const { container } = render(<ReturnsList devoluciones={[]} />);

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  it('devolución parcial → muestra tipo, monto, motivo y líneas', () => {
    // Act
    render(<ReturnsList devoluciones={[devolucion()]} />);

    // Assert
    expect(screen.getByText(/Devolución parcial/)).toBeInTheDocument();
    expect(screen.getByText('Q 149.00')).toBeInTheDocument();
    expect(screen.getByText(/Talla incorrecta/)).toBeInTheDocument();
    expect(screen.getByText('1 × Camiseta (CAM-LIM-NEG-M)')).toBeInTheDocument();
  });

  it('devolución total → lo indica', () => {
    // Act
    render(<ReturnsList devoluciones={[devolucion({ tipo: 'TOTAL' })]} />);

    // Assert
    expect(screen.getByText(/Devolución total/)).toBeInTheDocument();
  });
});
