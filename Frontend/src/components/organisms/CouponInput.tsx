import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import type { CuponCarrito } from '../../types/carrito';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';

interface Props {
  cupon: CuponCarrito | null;
  /** Solo el Cliente puede usar cupones; el invitado ve una invitación a iniciar sesión. */
  esCliente: boolean;
  cargando?: boolean;
  /** Mensaje exacto del 422 del último intento. */
  error?: string | null;
  onAplicar: (codigo: string) => void;
  onQuitar: () => void;
}

export function CouponInput({
  cupon,
  esCliente,
  cargando = false,
  error,
  onAplicar,
  onQuitar,
}: Props) {
  const [codigo, setCodigo] = useState('');

  if (!esCliente) {
    return (
      <p className="text-sm text-texto-suave">
        ¿Tienes un cupón?{' '}
        <Link to="/login?redirect=/carrito" className="font-medium text-acento hover:underline">
          Inicia sesión
        </Link>{' '}
        para usarlo.
      </p>
    );
  }

  function enviar(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpio = codigo.trim();
    if (limpio) onAplicar(limpio);
  }

  return (
    <div className="space-y-2">
      {cupon && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            cupon.aplicado ? 'bg-exito-suave text-exito-texto' : 'bg-aviso-suave text-aviso-texto'
          }`}
        >
          <p className="flex items-center justify-between gap-2">
            <span>
              Cupón <strong>{cupon.codigo}</strong> {cupon.aplicado ? 'aplicado' : 'no aplicado'}
            </span>
            <button
              type="button"
              onClick={onQuitar}
              disabled={cargando}
              className="text-xs underline disabled:opacity-50"
            >
              Quitar cupón
            </button>
          </p>
          {!cupon.aplicado && cupon.mensajeError && <p className="mt-1">{cupon.mensajeError}</p>}
        </div>
      )}

      <form onSubmit={enviar} noValidate className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="Código de cupón"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            error={error ?? undefined}
            maxLength={30}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variante="secondary" cargando={cargando} className="mb-0.5">
          Aplicar
        </Button>
      </form>
    </div>
  );
}
