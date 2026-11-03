import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderizar } from '../test/renderizar';
import { useServerTable } from './useServerTable';

const FILTROS = ['q', 'estado'] as const;

function Tabla() {
  const t = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'nombre:asc',
    pageSizePorDefecto: 20,
  });
  return (
    <div>
      <output aria-label="params">{JSON.stringify(t.params)}</output>
      <button onClick={() => t.setPage(3)}>página 3</button>
      <button onClick={() => t.setFiltros({ estado: 'ENTREGADO' })}>filtrar</button>
      <button onClick={() => t.setSort('precio:desc')}>ordenar</button>
    </div>
  );
}

const leer = () =>
  JSON.parse(screen.getByLabelText('params').textContent ?? '{}') as Record<string, unknown>;

describe('useServerTable', () => {
  it('lee página, tamaño, orden y filtros de la URL', () => {
    // Arrange
    const ruta = '/t?page=2&size=50&sort=precio:asc&q=tenis';

    // Act
    renderizar(<Tabla />, { ruta });

    // Assert
    expect(leer()).toEqual({ page: 2, pageSize: 50, sort: 'precio:asc', q: 'tenis' });
  });

  it('sin parámetros usa los valores por defecto y no envía filtros vacíos', () => {
    // Arrange / Act
    renderizar(<Tabla />, { ruta: '/t' });

    // Assert
    expect(leer()).toEqual({ page: 1, pageSize: 20, sort: 'nombre:asc' });
  });

  it('cambiar un filtro lo escribe en la URL y vuelve a la página 1', async () => {
    // Arrange
    const { router } = renderizar(<Tabla />, { ruta: '/t?page=4' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'filtrar' }));

    // Assert
    expect(router.state.location.search).toBe('?estado=ENTREGADO');
    expect(leer()).toMatchObject({ page: 1, estado: 'ENTREGADO' });
  });

  it('cambiar de página y de orden actualiza la URL', async () => {
    // Arrange
    const { router } = renderizar(<Tabla />, { ruta: '/t' });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'página 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'ordenar' }));

    // Assert
    const url = new URLSearchParams(router.state.location.search);
    expect(url.get('sort')).toBe('precio:desc');
    expect(url.get('page')).toBeNull(); // ordenar vuelve a la página 1
  });
});
