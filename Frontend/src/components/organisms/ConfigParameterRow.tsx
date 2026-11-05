import { useState, type SubmitEvent } from 'react';
import { ApiError } from '../../services/http';
import type { ParametroConfiguracion } from '../../types/administracion';
import { ayudaParametro, validarParametro } from '../../utils/configuracion';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';

interface Props {
  parametro: ParametroConfiguracion;
  /** Guarda el valor; debe rechazar con el ApiError si falla. */
  onGuardar: (clave: string, valor: string) => Promise<unknown>;
}

/** Un parámetro del sistema con su valor editable, validado según su tipo. */
export function ConfigParameterRow({ parametro, onGuardar }: Props) {
  const [valor, setValor] = useState(parametro.valor);
  const [error, setError] = useState<string>();
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ultimo, setUltimo] = useState(parametro.valor);
  // Si el servidor devuelve otro valor (otra pestaña, normalización "15" → "15"), se adopta.
  if (parametro.valor !== ultimo) {
    setUltimo(parametro.valor);
    setValor(parametro.valor);
  }

  async function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardado(false);
    const mensaje = validarParametro(parametro.clave, valor);
    if (mensaje) return setError(mensaje);
    setError(undefined);
    setGuardando(true);
    try {
      await onGuardar(parametro.clave, valor.trim());
      setGuardado(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el parámetro.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void enviar(e)}
      noValidate
      className="tarjeta grid items-start gap-3 p-4 sm:grid-cols-[1fr_12rem_auto]"
    >
      <div>
        <p className="font-medium text-texto">{parametro.clave}</p>
        {parametro.descripcion && (
          <p className="text-sm text-texto-suave">{parametro.descripcion}</p>
        )}
      </div>
      <Input
        label={`Valor de ${parametro.clave}`}
        value={valor}
        ayuda={ayudaParametro(parametro.clave)}
        error={error}
        onChange={(e) => {
          setValor(e.target.value);
          setGuardado(false);
        }}
      />
      <div className="sm:mt-6">
        <Button type="submit" cargando={guardando} aria-label={`Guardar ${parametro.clave}`}>
          Guardar
        </Button>
        {guardado && (
          <p role="status" className="mt-1 text-xs text-exito-texto">
            Guardado
          </p>
        )}
      </div>
    </form>
  );
}
