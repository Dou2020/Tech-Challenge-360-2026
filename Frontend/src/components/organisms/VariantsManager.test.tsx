import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { atributosApi, productosApi, variantesApi } from '../../services/api/gestion';
import { ApiError } from '../../services/http';
import { renderizar } from '../../test/renderizar';
import type { ProductoGestion, VarianteGestion } from '../../types/gestion';
import { VariantsManager } from './VariantsManager';

vi.mock('../../services/api/gestion', () => ({
  productosApi: { agregarVariante: vi.fn() },
  variantesApi: { actualizar: vi.fn(), cambiarPrecio: vi.fn(), cambiarEstado: vi.fn() },
  atributosApi: { listar: vi.fn(), crear: vi.fn(), agregarValor: vi.fn() },
}));

const variante: VarianteGestion = {
  idVariante: 17,
  idProducto: 8,
  sku: 'SUD-M',
  precio: '249.00',
  existenciaFisica: 10,
  existenciaReservada: 2,
  existenciaDisponible: 8,
  activo: true,
  descripcion: 'Talla M',
  valores: [],
};
const producto = { idProducto: 8, variantes: [variante] } as ProductoGestion;

function montar(variantes: VarianteGestion[] = [variante]) {
  const onAviso = vi.fn();
  renderizar(<VariantsManager producto={{ ...producto, variantes }} onAviso={onAviso} />);
  return onAviso;
}

describe('VariantsManager', () => {
  beforeEach(() => {
    vi.mocked(productosApi.agregarVariante).mockReset();
    Object.values(variantesApi).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset());
    vi.mocked(atributosApi.listar).mockReset().mockResolvedValue([]);
  });

  it('lista las variantes con precio, existencia y estado del backend', () => {
    // Act
    montar();

    // Assert
    expect(screen.getByText('SUD-M')).toBeInTheDocument();
    expect(screen.getByText('Q 249.00')).toBeInTheDocument();
    expect(screen.getByText('8 disp. / 10 fís.')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('variante inactiva → ofrece activarla', () => {
    // Act
    montar([{ ...variante, activo: false }]);

    // Assert
    expect(screen.getByText('Inactiva')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar SUD-M' })).toBeInTheDocument();
  });

  it('Agregar variante → abre el formulario y lo guarda con aviso', async () => {
    // Arrange
    vi.mocked(productosApi.agregarVariante).mockResolvedValue({ ...variante, sku: 'SUD-L' });
    const onAviso = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar variante' }));
    await userEvent.type(await screen.findByLabelText('SKU'), 'SUD-L');
    await userEvent.type(screen.getByLabelText('Precio'), '259');

    // Act
    await userEvent.click(screen.getAllByRole('button', { name: 'Agregar variante' }).at(-1)!);

    // Assert
    await waitFor(() =>
      expect(productosApi.agregarVariante).toHaveBeenCalledWith(8, {
        sku: 'SUD-L',
        precio: '259',
        existenciaInicial: 0,
        valores: [],
      }),
    );
    await waitFor(() =>
      expect(onAviso).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'exito', mensaje: 'Variante SUD-L agregada.' }),
      ),
    );
  });

  it('Editar → precarga el SKU y guarda con aviso', async () => {
    // Arrange
    vi.mocked(variantesApi.actualizar).mockResolvedValue(variante);
    const onAviso = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Editar SUD-M' }));
    const sku = await screen.findByLabelText('SKU');
    expect(sku).toHaveValue('SUD-M');
    await userEvent.clear(sku);
    await userEvent.type(sku, 'SUD-MM');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar variante' }));

    // Assert
    await waitFor(() =>
      expect(variantesApi.actualizar).toHaveBeenCalledWith(17, { sku: 'SUD-MM', valores: [] }),
    );
    await waitFor(() =>
      expect(onAviso).toHaveBeenCalledWith(
        expect.objectContaining({ mensaje: 'Variante SUD-MM actualizada.' }),
      ),
    );
  });

  it('Cancelar el formulario → lo cierra', async () => {
    // Arrange
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Editar SUD-M' }));
    await screen.findByLabelText('SKU');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(screen.queryByLabelText('SKU')).not.toBeInTheDocument();
  });

  it('atributos que no cargan → ErrorState con Reintentar', async () => {
    // Arrange
    vi.mocked(atributosApi.listar)
      .mockRejectedValueOnce(new ApiError(500, 'ERROR_INTERNO', 'Falla de atributos.', [], 'req-3'))
      .mockResolvedValueOnce([]);
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Editar SUD-M' }));
    expect(await screen.findByText('Referencia: req-3')).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // Assert
    expect(await screen.findByLabelText('SKU')).toBeInTheDocument();
  });

  it('Cambiar precio → envía el precio nuevo y avisa', async () => {
    // Arrange
    vi.mocked(variantesApi.cambiarPrecio).mockResolvedValue({ ...variante, precio: '199.00' });
    const onAviso = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar precio de SUD-M' }));
    await userEvent.type(screen.getByLabelText('Nuevo precio'), '199');

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cambiar precio' }),
    );

    // Assert
    await waitFor(() => expect(variantesApi.cambiarPrecio).toHaveBeenCalledWith(17, '199'));
    await waitFor(() =>
      expect(onAviso).toHaveBeenCalledWith(
        expect.objectContaining({ mensaje: 'Precio de SUD-M actualizado.' }),
      ),
    );
  });

  it('Cancelar el cambio de precio → cierra el diálogo sin llamar a la API', async () => {
    // Arrange
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar precio de SUD-M' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(variantesApi.cambiarPrecio).not.toHaveBeenCalled();
  });

  it('desactivar → confirma, envía activo false y avisa', async () => {
    // Arrange
    vi.mocked(variantesApi.cambiarEstado).mockResolvedValue({ ...variante, activo: false });
    const onAviso = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar SUD-M' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    await waitFor(() => expect(variantesApi.cambiarEstado).toHaveBeenCalledWith(17, false));
    await waitFor(() =>
      expect(onAviso).toHaveBeenCalledWith(
        expect.objectContaining({ mensaje: 'Variante SUD-M desactivada.' }),
      ),
    );
  });

  it('activar → envía activo true', async () => {
    // Arrange
    vi.mocked(variantesApi.cambiarEstado).mockResolvedValue(variante);
    const onAviso = montar([{ ...variante, activo: false }]);
    await userEvent.click(screen.getByRole('button', { name: 'Activar SUD-M' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    await waitFor(() => expect(variantesApi.cambiarEstado).toHaveBeenCalledWith(17, true));
    await waitFor(() =>
      expect(onAviso).toHaveBeenCalledWith(
        expect.objectContaining({ mensaje: 'Variante SUD-M activada.' }),
      ),
    );
  });

  it('el cambio de estado falla → aviso de error con requestId', async () => {
    // Arrange
    vi.mocked(variantesApi.cambiarEstado).mockRejectedValue(
      new ApiError(500, 'ERROR_INTERNO', 'Falla.', [], 'req-9'),
    );
    const onAviso = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar SUD-M' }));

    // Act
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar' }),
    );

    // Assert
    await waitFor(() =>
      expect(onAviso).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'error', referencia: 'req-9' }),
      ),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Gestionar atributos → muestra y oculta el panel', async () => {
    // Arrange
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Gestionar atributos' }));
    expect(await screen.findByRole('heading', { name: 'Atributos y valores' })).toBeInTheDocument();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar atributos' }));

    // Assert
    expect(screen.queryByRole('heading', { name: 'Atributos y valores' })).not.toBeInTheDocument();
  });
});
