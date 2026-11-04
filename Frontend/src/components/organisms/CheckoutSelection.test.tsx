import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogoApi } from '../../services/api/catalogo';
import { direccionesApi } from '../../services/api/direcciones';
import { ApiError } from '../../services/http';
import { crearDireccion } from '../../test/fixtures/direcciones';
import { renderizar } from '../../test/renderizar';
import { CheckoutSelection } from './CheckoutSelection';

vi.mock('../../services/api/direcciones', () => ({
  direccionesApi: { listar: vi.fn(), crear: vi.fn() },
}));
vi.mock('../../services/api/catalogo', () => ({ catalogoApi: { metodosEnvio: vi.fn() } }));
const direcciones = vi.mocked(direccionesApi);
const metodos = vi.mocked(catalogoApi.metodosEnvio);

const estandar = { idMetodoEnvio: 1, nombre: 'Estándar', costo: '25.00', diasEstimados: 3 };
const express = { idMetodoEnvio: 2, nombre: 'Express', costo: '45.00', diasEstimados: 1 };

function mostrar(props: Partial<Parameters<typeof CheckoutSelection>[0]> = {}) {
  const onContinuar = vi.fn();
  renderizar(
    <CheckoutSelection
      idDireccionInicial={null}
      idMetodoEnvioInicial={null}
      iniciando={false}
      onContinuar={onContinuar}
      {...props}
    />,
  );
  return onContinuar;
}

describe('CheckoutSelection', () => {
  beforeEach(() => {
    direcciones.listar.mockReset().mockResolvedValue([crearDireccion()]);
    direcciones.crear.mockReset();
    metodos.mockReset().mockResolvedValue([estandar, express]);
  });

  it('cargando → muestra el estado de carga', () => {
    // Arrange
    direcciones.listar.mockReturnValue(new Promise(() => undefined));

    // Act
    mostrar();

    // Assert
    expect(
      screen.getByRole('status', { name: 'Cargando opciones de entrega' }),
    ).toBeInTheDocument();
  });

  it('error al cargar → ErrorState con requestId y Reintentar vuelve a pedir ambas listas', async () => {
    // Arrange
    metodos
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla de envíos.', [], 'req-91'))
      .mockResolvedValueOnce([estandar]);
    mostrar();
    expect(await screen.findByText('Referencia: req-91')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByRole('radio', { name: /Estándar/ })).toBeInTheDocument();
    expect(metodos).toHaveBeenCalledTimes(2);
    expect(direcciones.listar).toHaveBeenCalledTimes(2);
  });

  it('muestra las direcciones y los métodos de envío con su costo', async () => {
    // Act
    mostrar();

    // Assert
    expect(await screen.findByRole('radio', { name: /Casa/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Express/ })).toBeInTheDocument();
    expect(screen.getByText('Q 45.00')).toBeInTheDocument();
    expect(screen.getByText('1 día(s) estimados')).toBeInTheDocument();
  });

  it('sin selección → "Continuar al pago" deshabilitado', async () => {
    // Act
    mostrar();

    // Assert
    expect(await screen.findByRole('button', { name: 'Continuar al pago' })).toBeDisabled();
  });

  it('con selección inicial (URL) → los radios vienen marcados y se puede continuar', async () => {
    // Act
    mostrar({ idDireccionInicial: 5, idMetodoEnvioInicial: 2 });

    // Assert
    expect(await screen.findByRole('radio', { name: /Casa/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Express/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Continuar al pago' })).toBeEnabled();
  });

  it('elegir dirección y envío y continuar → emite ambos ids', async () => {
    // Arrange
    const onContinuar = mostrar();
    await userEvent.click(await screen.findByRole('radio', { name: /Casa/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Express/ }));

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Continuar al pago' }));

    // Assert
    expect(onContinuar).toHaveBeenCalledWith(5, 2);
  });

  it('iniciando → el botón queda deshabilitado', async () => {
    // Act
    mostrar({ idDireccionInicial: 5, idMetodoEnvioInicial: 1, iniciando: true });

    // Assert
    expect(await screen.findByRole('button', { name: /Continuar al pago/ })).toBeDisabled();
  });

  it('sin direcciones → muestra el formulario para agregar una', async () => {
    // Arrange
    direcciones.listar.mockResolvedValue([]);

    // Act
    mostrar();

    // Assert
    expect(await screen.findByText('Agrega una dirección de entrega')).toBeInTheDocument();
    expect(screen.getByLabelText('Alias')).toBeInTheDocument();
  });

  it('"Usar otra dirección" → abre el formulario y se puede cancelar', async () => {
    // Arrange
    mostrar();
    await userEvent.click(await screen.findByRole('button', { name: 'Usar otra dirección' }));
    expect(screen.getByRole('region', { name: 'Nueva dirección' })).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByRole('region', { name: 'Nueva dirección' })).not.toBeInTheDocument();
  });

  it('guardar una dirección nueva → la crea y queda seleccionada', async () => {
    // Arrange
    const nueva = crearDireccion({ idDireccion: 9, alias: 'Oficina' });
    direcciones.listar
      .mockResolvedValueOnce([crearDireccion()])
      .mockResolvedValue([crearDireccion(), nueva]);
    direcciones.crear.mockResolvedValue(nueva);
    mostrar();
    await userEvent.click(await screen.findByRole('button', { name: 'Usar otra dirección' }));
    await userEvent.type(screen.getByLabelText('Alias'), 'Oficina');
    await userEvent.type(screen.getByLabelText('Nombre del destinatario'), 'Ana López');
    await userEvent.type(screen.getByLabelText('Teléfono'), '5555-1234');
    await userEvent.type(screen.getByLabelText('Dirección'), '10a calle 3-45');
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Guatemala');
    await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Mixco');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y usar esta dirección' }));

    // Assert
    expect(await screen.findByRole('radio', { name: /Oficina/ })).toBeChecked();
    expect(direcciones.crear).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'Oficina', municipio: 'Mixco', departamento: 'Guatemala' }),
    );
  });
});
