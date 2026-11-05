import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CategorySalesChart } from './CategorySalesChart';

describe('CategorySalesChart', () => {
  it('con datos → gráfica accesible con las categorías en el eje', () => {
    // Act
    render(
      <CategorySalesChart
        datos={[
          {
            idCategoria: 2,
            categoria: 'Calzado',
            unidadesVendidas: 5,
            unidadesDevueltas: 1,
            unidadesNetas: 4,
            ventaBruta: '1000.00',
            montoReembolsado: '200.00',
            ventaNeta: '800.00',
          },
        ]}
      />,
    );

    // Assert
    expect(
      screen.getByRole('img', { name: 'Gráfica de venta neta por categoría' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Calzado').length).toBeGreaterThan(0);
  });
});
