import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  etiquetaTarjeta,
  etiquetasMarcaTarjeta,
  etiquetasTipoTarjeta,
  marcasTarjeta,
  tiposTarjeta,
} from '../../config/tarjetas';
import type { DatosPago } from '../../types/checkout';
import type { Tarjeta } from '../../types/tarjetas';
import {
  OTRA_TARJETA,
  construirDatosPago,
  esquemaMarca,
  esquemaTipo,
  esquemaTitular,
  esquemaUltimos4,
  seleccionInicial,
} from '../../utils/tarjetas';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';

const esquema = z
  .object({
    seleccion: z.string(),
    titular: z.string(),
    ultimos4: z.string(),
    tipo: z.string(),
    marca: z.string(),
    guardar: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.seleccion !== OTRA_TARJETA) return;
    const campos = [
      ['titular', esquemaTitular, v.titular],
      ['ultimos4', esquemaUltimos4, v.ultimos4],
    ] as const;
    for (const [campo, regla, valor] of campos) {
      const r = regla.safeParse(valor);
      if (!r.success)
        ctx.addIssue({ code: 'custom', path: [campo], message: r.error.issues[0]?.message ?? '' });
    }
    // Tipo y marca solo son obligatorios si la tarjeta se va a guardar.
    if (!v.guardar) return;
    const obligatorios = [
      ['tipo', esquemaTipo, v.tipo],
      ['marca', esquemaMarca, v.marca],
    ] as const;
    for (const [campo, regla, valor] of obligatorios) {
      const r = regla.safeParse(valor);
      if (!r.success)
        ctx.addIssue({ code: 'custom', path: [campo], message: r.error.issues[0]?.message ?? '' });
    }
  });

type Formulario = z.infer<typeof esquema>;

interface Props {
  /** Debe devolver una promesa: el botón queda deshabilitado hasta que termine. */
  onPagar: (datos: DatosPago) => Promise<unknown>;
  deshabilitado?: boolean;
  /** Tarjetas guardadas del cliente; con ellas se ofrece elegir una en vez de teclear los datos. */
  tarjetas?: Tarjeta[];
}

/** Pago con tarjeta (simulado): una guardada o una nueva, que opcionalmente se guarda. */
export function PaymentForm({ onPagar, deshabilitado = false, tarjetas = [] }: Props) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    resolver: zodResolver(esquema),
    defaultValues: {
      seleccion: seleccionInicial(tarjetas),
      titular: '',
      ultimos4: '',
      tipo: '',
      marca: '',
      guardar: false,
    },
  });
  const seleccion = useWatch({ control, name: 'seleccion' });
  const nueva = seleccion === OTRA_TARJETA;

  return (
    <form
      onSubmit={handleSubmit((v) => onPagar(construirDatosPago(v)))}
      noValidate
      aria-labelledby="titulo-pago"
      className="tarjeta space-y-4 p-5"
    >
      <h2 id="titulo-pago" className="font-semibold tracking-tight text-texto">
        Pago con tarjeta
      </h2>

      {tarjetas.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-texto-suave">Elige una tarjeta</legend>
          {tarjetas.map((t) => (
            <label
              key={t.idTarjeta}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-borde px-3 py-2.5 text-sm transition-colors hover:border-borde-fuerte has-checked:border-primario has-checked:bg-acento-suave"
            >
              <input type="radio" value={String(t.idTarjeta)} {...register('seleccion')} />
              <span>{etiquetaTarjeta(t)}</span>
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-borde px-3 py-2.5 text-sm transition-colors hover:border-borde-fuerte has-checked:border-primario has-checked:bg-acento-suave">
            <input type="radio" value={OTRA_TARJETA} {...register('seleccion')} />
            <span>Usar otra tarjeta</span>
          </label>
        </fieldset>
      )}

      {nueva && (
        <>
          <Input
            label="Titular de la tarjeta"
            autoComplete="cc-name"
            error={errors.titular?.message}
            {...register('titular')}
          />
          <Input
            label="Últimos 4 dígitos de la tarjeta"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            ayuda="El pago es simulado: solo pedimos los últimos 4 dígitos."
            error={errors.ultimos4?.message}
            {...register('ultimos4')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Tipo de tarjeta" error={errors.tipo?.message} {...register('tipo')}>
              <option value="">Elige el tipo</option>
              {tiposTarjeta.map((t) => (
                <option key={t} value={t}>
                  {etiquetasTipoTarjeta[t]}
                </option>
              ))}
            </Select>
            <Select label="Marca" error={errors.marca?.message} {...register('marca')}>
              <option value="">Elige la marca</option>
              {marcasTarjeta.map((m) => (
                <option key={m} value={m}>
                  {etiquetasMarcaTarjeta[m]}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-texto-suave">
            <input type="checkbox" {...register('guardar')} />
            Guardar esta tarjeta para próximas compras
          </label>
          <p className="text-xs text-texto-tenue">
            Solo guardamos el titular, la marca, el tipo y los 4 últimos dígitos. Nunca el número
            completo.
          </p>
        </>
      )}

      <Button type="submit" className="w-full" cargando={isSubmitting} disabled={deshabilitado}>
        Pagar
      </Button>
    </form>
  );
}
