import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { crearPedidoDetalle } from '../../test/fixtures/pedidos';
import { OrderLinesTable } from './OrderLinesTable';

const base = crearPedidoDetalle().lineas[0]!;

describe('OrderLinesTable', () => {
  it('muestra producto, variante, SKU y los montos congelados tal cual vienen', () => {
    // Arrange: el subtotal no es cantidad × precio, para detectar un recálculo.
    const linea = { ...base, cantidad: 2, precioUnitario: '149.00', subtotal: '290.00' };

    // Act
    render(<OrderLinesTable lineas={[linea]} />);

    // Assert
    const fila = screen.getAllByRole('row')[1]!;
    expect(within(fila).getByText('Camiseta')).toBeInTheDocument();
    expect(within(fila).getByText(/M \/ Negro/)).toBeInTheDocument();
    expect(within(fila).getByText(/SKU CAM-LIM-NEG-M/)).toBeInTheDocument();
    expect(within(fila).getByText('Q 149.00')).toBeInTheDocument();
    expect(within(fila).getByText('Q 290.00')).toBeInTheDocument();
  });

  it('línea con devoluciones → indica cuántas unidades se devolvieron', () => {
    // Act
    render(<OrderLinesTable lineas={[{ ...base, cantidadDevuelta: 1 }]} />);

    // Assert
    expect(screen.getByText(/devueltas: 1/)).toBeInTheDocument();
  });

  it('sin devoluciones ni variante → no muestra esos textos', () => {
    // Act
    render(<OrderLinesTable lineas={[{ ...base, variante: null }]} />);

    // Assert
    expect(screen.queryByText(/devueltas/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Negro/)).not.toBeInTheDocument();
  });
});
