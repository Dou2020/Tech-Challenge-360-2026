import { useId, type Ref, type SelectHTMLAttributes } from 'react';
import { ariaCampo, claseControl } from '../../utils/campos';
import { Field } from './Field';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | undefined;
  ayuda?: string | undefined;
  ref?: Ref<HTMLSelectElement>;
}

/** Lista desplegable con etiqueta y error accesibles. Las opciones van como hijos. */
export function Select({ label, error, ayuda, id, className = '', children, ...resto }: Props) {
  const generado = useId();
  const idCampo = id ?? generado;
  return (
    <Field id={idCampo} label={label} error={error} ayuda={ayuda}>
      <select
        id={idCampo}
        {...ariaCampo(idCampo, error, ayuda)}
        className={`${claseControl(Boolean(error))} ${className}`}
        {...resto}
      >
        {children}
      </select>
    </Field>
  );
}
