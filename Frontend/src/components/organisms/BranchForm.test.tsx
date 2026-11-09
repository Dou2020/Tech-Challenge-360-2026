import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { crearSucursalGestion } from '../../test/fixtures/sucursales';
import { renderizar } from '../../test/renderizar';
import { BranchForm } from './BranchForm';

function mostrar(
  props: Partial<Parameters<typeof BranchForm>[0]> = {},
  onGuardar = vi.fn().mockResolvedValue(undefined),
) {
  const onCancelar = vi.fn();
  renderizar(<BranchForm onGuardar={onGuardar} onCancelar={onCancelar} {...props} />);
  return { onGuardar, onCancelar };
}

async function llenarObligatorios(telefono = '22334455') {
  await userEvent.type(screen.getByLabelText('Nombre'), 'Zona 10');
  await userEvent.type(screen.getByLabelText('Teléfono'), telefono);
  await userEvent.type(screen.getByLabelText('Dirección'), '6a avenida 12-34');
  await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Guatemala');
  await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Mixco');
}

describe('BranchForm', () => {
  it('sin sucursal → es de alta: botón "Crear sucursal" y campos vacíos', () => {
    // Act
    mostrar();

    // Assert
    expect(screen.getByRole('button', { name: 'Crear sucursal' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByLabelText('Municipio')).toBeDisabled();
  });

  it('enviar vacío → un mensaje por campo obligatorio con aria-invalid y sin llamar a la API', async () => {
    // Arrange
    const { onGuardar } = mostrar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    expect(await screen.findByText('Ingresa el nombre.')).toBeInTheDocument();
    expect(screen.getByText('Teléfono inválido: de 8 a 20 dígitos.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa la dirección.')).toBeInTheDocument();
    expect(screen.getByText('Elige un departamento.')).toBeInTheDocument();
    expect(screen.getByText('Elige un municipio.')).toBeInTheDocument();
    ['Nombre', 'Teléfono', 'Dirección', 'Departamento'].forEach((etiqueta) =>
      expect(screen.getByLabelText(etiqueta)).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it.each([
    ['con letras', 'abc12345'],
    ['con guion', '5555-1234'],
    ['de 7 dígitos', '1234567'],
    ['de 21 dígitos', '1'.repeat(21)],
  ])('teléfono %s → error en el campo y no se envía', async (_caso, telefono) => {
    // Arrange
    const { onGuardar } = mostrar();
    await llenarObligatorios(telefono);

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    expect(await screen.findByText('Teléfono inválido: de 8 a 20 dígitos.')).toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono')).toHaveAttribute('aria-invalid', 'true');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it.each([['12345678'], ['1'.repeat(20)]])(
    'teléfono de %s → es válido y se envía',
    async (telefono) => {
      // Arrange
      const { onGuardar } = mostrar();
      await llenarObligatorios(telefono);

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

      // Assert
      await vi.waitFor(() =>
        expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ telefono })),
      );
    },
  );

  it.each([['1234'], ['123456'], ['abcde']])(
    'código postal "%s" → "Debe tener 5 dígitos." y no se envía',
    async (codigo) => {
      // Arrange
      const { onGuardar } = mostrar();
      await llenarObligatorios();
      await userEvent.type(screen.getByLabelText('Código postal (opcional)'), codigo);

      // Act
      await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

      // Assert
      expect(await screen.findByText('Debe tener 5 dígitos.')).toBeInTheDocument();
      expect(screen.getByLabelText('Código postal (opcional)')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      expect(onGuardar).not.toHaveBeenCalled();
    },
  );

  it('los campos de texto limitan la longitud a 100 y 200 como la API', () => {
    // Act
    mostrar();

    // Assert
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('maxlength', '100');
    expect(screen.getByLabelText('Dirección')).toHaveAttribute('maxlength', '200');
    expect(screen.getByLabelText('Complemento (opcional)')).toHaveAttribute('maxlength', '200');
    expect(screen.getByLabelText('Horario (opcional)')).toHaveAttribute('maxlength', '200');
  });

  it('el municipio depende del departamento: se habilita con sus municipios', async () => {
    // Arrange
    mostrar();
    const municipio = screen.getByLabelText('Municipio');
    expect(municipio).toBeDisabled();

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Sacatepéquez');

    // Assert
    expect(municipio).toBeEnabled();
    expect(
      within(municipio).getByRole('option', { name: 'Antigua Guatemala' }),
    ).toBeInTheDocument();
    expect(within(municipio).queryByRole('option', { name: 'Mixco' })).not.toBeInTheDocument();
  });

  it('cambiar de departamento → limpia el municipio elegido', async () => {
    // Arrange
    mostrar();
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Guatemala');
    await userEvent.selectOptions(screen.getByLabelText('Municipio'), 'Mixco');

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Departamento'), 'Sacatepéquez');

    // Assert
    expect(screen.getByLabelText('Municipio')).toHaveValue('');
  });

  it('en edición → precarga los valores y el botón dice "Guardar cambios"', () => {
    // Arrange
    const sucursal = crearSucursalGestion({
      linea2: 'Local 4',
      codigoPostal: '01010',
      municipio: 'Mixco',
    });

    // Act
    mostrar({ sucursal });

    // Assert
    expect(screen.getByLabelText('Nombre')).toHaveValue('Zona 10');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('22334455');
    expect(screen.getByLabelText('Dirección')).toHaveValue('6a avenida 12-34');
    expect(screen.getByLabelText('Complemento (opcional)')).toHaveValue('Local 4');
    expect(screen.getByLabelText('Departamento')).toHaveValue('Guatemala');
    expect(screen.getByLabelText('Municipio')).toHaveValue('Mixco');
    expect(screen.getByLabelText('Código postal (opcional)')).toHaveValue('01010');
    expect(screen.getByLabelText('Horario (opcional)')).toHaveValue(
      'Lunes a viernes de 9:00 a 18:00',
    );
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('edición con departamento y municipio fuera de la lista → se conservan como opciones', () => {
    // Arrange
    const sucursal = crearSucursalGestion({ departamento: 'Atlántida', municipio: 'La Ceiba' });

    // Act
    mostrar({ sucursal });

    // Assert
    expect(screen.getByLabelText('Departamento')).toHaveValue('Atlántida');
    expect(screen.getByLabelText('Municipio')).toHaveValue('La Ceiba');
  });

  it('edición sin cambios → envía los datos precargados sin los opcionales vacíos', async () => {
    // Arrange
    const { onGuardar } = mostrar({ sucursal: crearSucursalGestion() });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    // Assert
    await vi.waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({
        nombre: 'Zona 10',
        telefono: '22334455',
        linea1: '6a avenida 12-34',
        departamento: 'Guatemala',
        municipio: 'Guatemala',
        horario: 'Lunes a viernes de 9:00 a 18:00',
      }),
    );
  });

  it('opcionales vacíos → no se envían', async () => {
    // Arrange
    const { onGuardar } = mostrar();
    await llenarObligatorios();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    await vi.waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1));
    const datos = onGuardar.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(datos).toEqual({
      nombre: 'Zona 10',
      telefono: '22334455',
      linea1: '6a avenida 12-34',
      departamento: 'Guatemala',
      municipio: 'Mixco',
    });
    expect(datos).not.toHaveProperty('linea2');
    expect(datos).not.toHaveProperty('codigoPostal');
    expect(datos).not.toHaveProperty('horario');
  });

  it('opcionales con valor → se envían recortados', async () => {
    // Arrange
    const { onGuardar } = mostrar();
    await llenarObligatorios();
    await userEvent.type(screen.getByLabelText('Complemento (opcional)'), '  Local 4 ');
    await userEvent.type(screen.getByLabelText('Código postal (opcional)'), '01010');
    await userEvent.type(screen.getByLabelText('Horario (opcional)'), 'Lunes a viernes');

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    await vi.waitFor(() =>
      expect(onGuardar).toHaveBeenCalledWith({
        nombre: 'Zona 10',
        telefono: '22334455',
        linea1: '6a avenida 12-34',
        departamento: 'Guatemala',
        municipio: 'Mixco',
        linea2: 'Local 4',
        codigoPostal: '01010',
        horario: 'Lunes a viernes',
      }),
    );
  });

  it('durante el envío → el botón queda deshabilitado', async () => {
    // Arrange
    mostrar({}, vi.fn().mockReturnValue(new Promise(() => undefined)));
    await llenarObligatorios();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /Crear sucursal/ })).toBeDisabled(),
    );
  });

  it('Cancelar → llama a onCancelar sin enviar', async () => {
    // Arrange
    const { onGuardar, onCancelar } = mostrar();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    // Assert
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('los details de la API (422) van a su campo con aria-invalid', async () => {
    // Arrange
    mostrar(
      {},
      vi.fn().mockRejectedValue(
        new ApiError(422, 'VALIDACION', 'Datos inválidos.', [
          { field: 'telefono', message: 'El teléfono ya está registrado.' },
          { field: 'codigoPostal', message: 'Código postal inexistente.' },
        ]),
      ),
    );
    await llenarObligatorios();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    expect(await screen.findByText('El teléfono ya está registrado.')).toBeInTheDocument();
    expect(screen.getByText('Código postal inexistente.')).toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Código postal (opcional)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('409 DUPLICADO → "Ya existe una sucursal con ese nombre." en el campo nombre', async () => {
    // Arrange
    mostrar({}, vi.fn().mockRejectedValue(new ApiError(409, 'DUPLICADO', 'Duplicado.')));
    await llenarObligatorios();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    expect(await screen.findByText('Ya existe una sucursal con ese nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
  });

  it('error sin campo (500) → mensaje del backend en un aviso general', async () => {
    // Arrange
    mostrar(
      {},
      vi.fn().mockRejectedValue(new ApiError(500, 'ERROR_INTERNO', 'Falla del servidor.')),
    );
    await llenarObligatorios();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('Falla del servidor.');
    expect(screen.getByLabelText('Nombre')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('error que no es de la API → mensaje genérico', async () => {
    // Arrange
    mostrar({}, vi.fn().mockRejectedValue(new Error('red caída')));
    await llenarObligatorios();

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Crear sucursal' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar la sucursal.');
  });
});
