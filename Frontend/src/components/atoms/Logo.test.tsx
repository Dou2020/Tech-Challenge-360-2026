import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderizar } from '../../test/renderizar';
import { Logo } from './Logo';

describe('Logo', () => {
  it('enlaza al inicio con el nombre ShopCart', () => {
    // Act
    renderizar(<Logo />);

    // Assert
    expect(screen.getByRole('link', { name: 'ShopCart' })).toHaveAttribute('href', '/');
  });
});
