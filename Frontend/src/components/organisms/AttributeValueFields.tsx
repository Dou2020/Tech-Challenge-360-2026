import type { UseFormRegisterReturn } from 'react-hook-form';
import type { Atributo } from '../../types/gestion';
import { claveAtributo } from '../../utils/productoForm';
import { Select } from '../atoms/Select';

interface Props {
  atributos: Atributo[];
  /** Registra el select de un atributo (la clave es `a<idAtributo>`). */
  registrar: (clave: string) => UseFormRegisterReturn;
  /** Prefijo para dar un id único a cada select. */
  prefijo: string;
  error?: string | undefined;
}

/** Un select por atributo: como máximo un valor por atributo, y todos son opcionales. */
export function AttributeValueFields({ atributos, registrar, prefijo, error }: Props) {
  if (atributos.length === 0) {
    return (
      <p className="text-xs text-texto-tenue">
        Aún no hay atributos (talla, color…). Créalos en "Gestionar atributos".
      </p>
    );
  }
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {atributos.map((a) => (
          <Select
            key={a.idAtributo}
            id={`${prefijo}-${claveAtributo(a.idAtributo)}`}
            label={a.nombre}
            {...registrar(claveAtributo(a.idAtributo))}
          >
            <option value="">Sin {a.nombre.toLowerCase()}</option>
            {a.valores.map((v) => (
              <option key={v.idValorAtributo} value={v.idValorAtributo}>
                {v.valor}
              </option>
            ))}
          </Select>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-peligro-texto">
          {error}
        </p>
      )}
    </div>
  );
}
