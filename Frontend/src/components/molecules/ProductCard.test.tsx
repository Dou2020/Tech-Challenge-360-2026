import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { crearProductoResumen } from '../../test/fixtures/catalogo';
import { renderizar } from '../../test/renderizar';
import { ProductCard } from './ProductCard';

describe('ProductCard', () => {
  it('enlaza al detalle y muestra nombre, categoría y precio', () => {
    // Act
    renderizar(<ProductCard producto={crearProductoResumen()} />);

    // Assert
    expect(screen.getByRole('link')).toHaveAttribute('href', '/productos/9');
    expect(screen.getByRole('heading', { name: 'Camisa básica' })).toBeInTheDocument();
    expect(screen.getByText('Camisetas')).toBeInTheDocument();
    expect(screen.getByText('Q 149.00')).toBeInTheDocument();
    expect(screen.queryByText('Desde')).not.toBeInTheDocument();
  });

  it('con rango de precios → muestra "Desde" y el mínimo', () => {
    // Act
    renderizar(
      <ProductCard
        producto={crearProductoResumen({ precioMinimo: '99.00', precioMaximo: '199.00' })}
      />,
    );

    // Assert
    expect(screen.getByText('Desde')).toBeInTheDocument();
    expect(screen.getByText('Q 99.00')).toBeInTheDocument();
  });

  it('con imagen → la muestra con el nombre como alt', () => {
    // Act
    renderizar(
      <ProductCard producto={crearProductoResumen({ imagenPrincipal: 'https://img/1.jpg' })} />,
    );

    // Assert
    expect(screen.getByRole('img', { name: 'Camisa básica' })).toHaveAttribute(
      'src',
      'https://img/1.jpg',
    );
  });

  it('sin disponibilidad → muestra la etiqueta Agotado', () => {
    // Act
    renderizar(<ProductCard producto={crearProductoResumen({ disponible: false })} />);

    // Assert
    expect(screen.getByText('Agotado')).toBeInTheDocument();
  });

  it('disponible → no muestra Agotado', () => {
    // Act
    renderizar(<ProductCard producto={crearProductoResumen()} />);

    // Assert
    expect(screen.queryByText('Agotado')).not.toBeInTheDocument();
  });
});
