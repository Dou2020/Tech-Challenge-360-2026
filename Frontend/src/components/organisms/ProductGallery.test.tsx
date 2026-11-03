import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ImagenProducto } from '../../types/catalogo';
import { ProductGallery } from './ProductGallery';

const imagenes: ImagenProducto[] = [
  { idProductoImagen: 1, url: 'https://img/1.jpg', orden: 1, esPrincipal: true },
  { idProductoImagen: 2, url: 'https://img/2.jpg', orden: 2, esPrincipal: false },
];

describe('ProductGallery', () => {
  it('sin imágenes → muestra el marcador "Sin imagen"', () => {
    // Act
    render(<ProductGallery imagenes={[]} nombre="Camisa" />);

    // Assert
    expect(screen.getByLabelText('Sin imagen')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Camisa' })).not.toBeInTheDocument();
  });

  it('una imagen → la muestra y no hay miniaturas', () => {
    // Act
    render(<ProductGallery imagenes={[imagenes[0]!]} nombre="Camisa" />);

    // Assert
    expect(screen.getByRole('img', { name: 'Camisa' })).toHaveAttribute('src', 'https://img/1.jpg');
    expect(screen.queryByRole('list', { name: 'Imágenes del producto' })).not.toBeInTheDocument();
  });

  it('varias imágenes → la principal primero y miniaturas', () => {
    // Act
    render(<ProductGallery imagenes={imagenes} nombre="Camisa" />);

    // Assert
    expect(screen.getByRole('img', { name: 'Camisa' })).toHaveAttribute('src', 'https://img/1.jpg');
    expect(screen.getByRole('button', { name: 'Ver imagen 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('clic en una miniatura → cambia la imagen principal', async () => {
    // Arrange
    render(<ProductGallery imagenes={imagenes} nombre="Camisa" />);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Ver imagen 2' }));

    // Assert
    expect(screen.getByRole('img', { name: 'Camisa' })).toHaveAttribute('src', 'https://img/2.jpg');
    expect(screen.getByRole('button', { name: 'Ver imagen 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
