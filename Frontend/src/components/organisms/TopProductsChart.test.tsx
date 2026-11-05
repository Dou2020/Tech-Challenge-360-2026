import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopProductsChart } from './TopProductsChart';

describe('TopProductsChart', () => {
  it('con datos → gráfica accesible con los productos en el eje', () => {
    // Act
    render(
      <TopProductsChart
        datos={[
          {
            idProducto: 5,
            producto: 'Tenis urbanos',
            idCategoria: 3,
            categoria: 'Calzado',
            unidadesNetas: 9,
            ventaNeta: '4131.00',
          },
        ]}
      />,
    );

    // Assert
    expect(
      screen.getByRole('img', { name: 'Gráfica de productos más vendidos' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Tenis urbanos').length).toBeGreaterThan(0);
  });
});
