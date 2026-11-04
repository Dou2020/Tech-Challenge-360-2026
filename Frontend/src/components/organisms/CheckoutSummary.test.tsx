import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResumenCheckout } from '../../types/checkout';
import { CheckoutSummary } from './CheckoutSummary';

function resumen(parcial: Partial<ResumenCheckout> = {}): ResumenCheckout {
  return {
    idCarrito: 88,
    items: [
      {
        idCarritoDetalle: 301,
        idVariante: 41,
        sku: 'CAM-LIM-NEG-M',
        producto: 'Camiseta',
        variante: 'M / Negro',
        cantidad: 2,
        precioUnitario: '149.00',
        importe: '298.00',
        descuentoLinea: '0.00',
        subtotal: '298.00',
      },
    ],
    cupon: null,
    cantidadLineas: 1,
    cantidadUnidades: 2,
    subtotal: '298.00',
    descuento: '0.00',
    costoEnvio: '25.00',
    total: '300.00',
    porcentajeIVA: '12.00',
    montoIVA: '32.14',
    metodoEnvio: { idMetodoEnvio: 1, nombre: 'Estándar', diasEstimados: 3 },
    reservaVigente: true,
    reservaExpiraEn: '2026-11-03T15:45:00.000Z',
    ...parcial,
  };
}

describe('CheckoutSummary', () => {
  it('muestra líneas y montos del backend; el total no se recalcula', () => {
    // Act: 298.00 + 25.00 = 323.00, el backend dice 300.00.
    render(<CheckoutSummary resumen={resumen()} />);

    // Assert
    expect(screen.getByText(/2 × Camiseta/)).toBeInTheDocument();
    expect(screen.getByText('(M / Negro)')).toBeInTheDocument();
    expect(screen.getByText('Q 300.00')).toBeInTheDocument();
    expect(screen.queryByText('Q 323.00')).not.toBeInTheDocument();
    expect(screen.getByText('Envío (Estándar)')).toBeInTheDocument();
    expect(screen.getByText('IVA incluido (12 %)')).toBeInTheDocument();
    expect(screen.getByText('Q 32.14')).toBeInTheDocument();
  });

  it('sin descuento → no muestra la fila', () => {
    // Act
    render(<CheckoutSummary resumen={resumen()} />);

    // Assert
    expect(screen.queryByText(/^Descuento/)).not.toBeInTheDocument();
  });

  it('con descuento y cupón aplicado → lo muestra con el código', () => {
    // Arrange
    const conCupon = resumen({
      descuento: '29.80',
      cupon: {
        idCupon: 3,
        codigo: 'VERANO25',
        descripcion: null,
        tipoDescuento: 'PORCENTAJE',
        valor: '10.00',
        aplicado: true,
        codigoError: null,
        mensajeError: null,
      },
    });

    // Act
    render(<CheckoutSummary resumen={conCupon} />);

    // Assert
    expect(screen.getByText('Descuento (VERANO25)')).toBeInTheDocument();
    expect(screen.getByText('Q 29.80')).toBeInTheDocument();
  });

  it('sin método de envío → "Envío" a secas', () => {
    // Act
    render(<CheckoutSummary resumen={resumen({ metodoEnvio: null })} />);

    // Assert
    expect(screen.getByText('Envío')).toBeInTheDocument();
  });
});
