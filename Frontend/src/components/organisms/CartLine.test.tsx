import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { crearLineaCarrito } from '../../test/fixtures/carrito';
import { renderizar } from '../../test/renderizar';
import type { LineaCarrito } from '../../types/carrito';
import { CartLine } from './CartLine';

function mostrar(
  parcial: Partial<LineaCarrito> = {},
  props: Partial<Parameters<typeof CartLine>[0]> = {},
) {
  const acciones = { onCantidad: vi.fn(), onQuitar: vi.fn() };
  renderizar(
    <ul>
      <CartLine linea={crearLineaCarrito(parcial)} {...acciones} {...props} />
    </ul>,
  );
  return acciones;
}

describe('CartLine', () => {
  it('muestra producto, variante, SKU e importe neto del backend', () => {
    // Act
    mostrar({ importeNeto: '280.00' });

    // Assert
    expect(screen.getByRole('link', { name: 'Camisa básica' })).toHaveAttribute(
      'href',
      '/productos/9',
    );
    expect(screen.getByText('Talla M / Azul')).toBeInTheDocument();
    expect(screen.getByText(/SKU CAM-BAS-M-AZ/)).toBeInTheDocument();
    expect(screen.getByText('Q 280.00')).toBeInTheDocument();
  });

  it('con descuento de línea → tacha el importe y muestra el descuento', () => {
    // Act
    mostrar({ descuentoLinea: '29.80', importeNeto: '268.20' });

    // Assert
    expect(screen.getByText(/Descuento/)).toBeInTheDocument();
    expect(screen.getByText('Q 29.80')).toBeInTheDocument();
  });

  it('sin problemas → no muestra alerta de ajuste', () => {
    // Act
    mostrar();

    // Assert
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [{ vendible: false, requiereAjuste: true }, /ya no está a la venta/],
    [{ existenciaDisponible: 0, excedeDisponible: true, requiereAjuste: true }, /Sin existencia/],
    [
      { existenciaDisponible: 1, excedeDisponible: true, requiereAjuste: true },
      /Solo hay 1 disponible/,
    ],
  ] as const)('línea con problema %j → alerta "Requiere ajuste"', (parcial, texto) => {
    // Act
    mostrar(parcial);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent('Requiere ajuste');
    expect(screen.getByRole('alert')).toHaveTextContent(texto);
  });

  it('clic en Quitar → llama a onQuitar con la variante', async () => {
    // Arrange
    const { onQuitar } = mostrar();

    // Act
    await userEvent.click(
      screen.getByRole('button', { name: 'Quitar Camisa básica Talla M / Azul' }),
    );

    // Assert
    expect(onQuitar).toHaveBeenCalledWith(41);
  });

  it('subir la cantidad → llama a onCantidad con la nueva cantidad', async () => {
    // Arrange
    const { onCantidad } = mostrar({ cantidad: 2, existenciaDisponible: 7 });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));

    // Assert
    expect(onCantidad).toHaveBeenCalledWith(41, 3);
  });

  it('ocupado → deshabilita Quitar', () => {
    // Act
    mostrar({}, { ocupado: true });

    // Assert
    expect(screen.getByRole('button', { name: /Quitar Camisa/ })).toBeDisabled();
  });
});
