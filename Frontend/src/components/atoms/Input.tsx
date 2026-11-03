import { useId, type InputHTMLAttributes, type Ref } from 'react';
import { ariaCampo, claseControl } from '../../utils/campos';
import { Field } from './Field';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  ayuda?: string | undefined;
  ref?: Ref<HTMLInputElement>;
}

/** Campo de texto con etiqueta y error accesibles; compatible con `register` de react-hook-form. */
export function Input({ label, error, ayuda, id, className = '', ...resto }: Props) {
  const generado = useId();
  const idCampo = id ?? generado;
  return (
    <Field id={idCampo} label={label} error={error} ayuda={ayuda}>
      <input
        id={idCampo}
        {...ariaCampo(idCampo, error, ayuda)}
        className={`${claseControl(Boolean(error))} ${className}`}
        {...resto}
      />
    </Field>
  );
}
