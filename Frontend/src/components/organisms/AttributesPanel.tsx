import { useState, type SubmitEvent } from 'react';
import { useAgregarValorAtributo, useAtributos, useCrearAtributo } from '../../hooks/queries';
import { ApiError } from '../../services/http';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Skeleton } from '../atoms/Skeleton';
import { ErrorState } from '../molecules/ErrorState';

const MAX = 50;

function mensaje(error: unknown, defecto: string): string {
  if (error instanceof ApiError)
    return error.code === 'DUPLICADO' ? 'Ya existe con ese nombre.' : error.message;
  return defecto;
}

/** Atributos (talla, color…) y sus valores: crear un atributo o agregarle un valor. */
export function AttributesPanel() {
  const atributos = useAtributos();
  const crearAtributo = useCrearAtributo();
  const agregarValor = useAgregarValorAtributo();
  const [nombre, setNombre] = useState('');
  const [errorNombre, setErrorNombre] = useState<string>();
  const [valores, setValores] = useState<Record<number, string>>({});
  const [erroresValor, setErroresValor] = useState<Record<number, string>>({});

  function crear(evento: SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) return setErrorNombre('Ingresa el nombre del atributo.');
    setErrorNombre(undefined);
    crearAtributo.mutate(limpio, {
      onSuccess: () => setNombre(''),
      onError: (error) => setErrorNombre(mensaje(error, 'No se pudo crear el atributo.')),
    });
  }

  function agregar(evento: SubmitEvent<HTMLFormElement>, idAtributo: number) {
    evento.preventDefault();
    const limpio = (valores[idAtributo] ?? '').trim();
    if (!limpio) return setErroresValor((p) => ({ ...p, [idAtributo]: 'Ingresa el valor.' }));
    setErroresValor((p) => ({ ...p, [idAtributo]: '' }));
    agregarValor.mutate(
      { idAtributo, valor: limpio },
      {
        onSuccess: () => setValores((p) => ({ ...p, [idAtributo]: '' })),
        onError: (error) =>
          setErroresValor((p) => ({
            ...p,
            [idAtributo]: mensaje(error, 'No se pudo agregar el valor.'),
          })),
      },
    );
  }

  return (
    <div className="space-y-4 rounded-lg bg-superficie-suave p-4">
      <h3 className="text-sm font-semibold text-texto">Atributos y valores</h3>

      <form onSubmit={crear} noValidate className="flex flex-wrap items-start gap-2">
        <div className="min-w-48 flex-1">
          <Input
            label="Nuevo atributo"
            maxLength={MAX}
            value={nombre}
            error={errorNombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <Button type="submit" className="mt-6" cargando={crearAtributo.isPending}>
          Crear atributo
        </Button>
      </form>

      {atributos.isPending && <Skeleton className="h-16 w-full" />}
      {atributos.isError && (
        <ErrorState error={atributos.error} onReintentar={() => void atributos.refetch()} />
      )}
      {atributos.data?.length === 0 && (
        <p className="text-sm text-texto-suave">Todavía no hay atributos.</p>
      )}
      <ul className="space-y-3">
        {atributos.data?.map((a) => (
          <li key={a.idAtributo} className="rounded-lg bg-superficie p-3 ring-1 ring-borde">
            <p className="text-sm font-medium text-texto">{a.nombre}</p>
            <p className="mt-1 text-xs text-texto-suave">
              {a.valores.length > 0 ? a.valores.map((v) => v.valor).join(', ') : 'Sin valores'}
            </p>
            <form
              onSubmit={(e) => agregar(e, a.idAtributo)}
              noValidate
              className="mt-2 flex flex-wrap items-start gap-2"
            >
              <div className="min-w-40 flex-1">
                <Input
                  label={`Nuevo valor de ${a.nombre}`}
                  maxLength={MAX}
                  value={valores[a.idAtributo] ?? ''}
                  error={erroresValor[a.idAtributo] || undefined}
                  onChange={(e) => setValores((p) => ({ ...p, [a.idAtributo]: e.target.value }))}
                />
              </div>
              <Button
                type="submit"
                variante="secondary"
                className="mt-6"
                aria-label={`Agregar valor a ${a.nombre}`}
              >
                Agregar valor
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
