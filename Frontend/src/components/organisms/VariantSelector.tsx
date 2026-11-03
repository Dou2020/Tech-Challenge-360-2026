import type { GrupoAtributo, Seleccion } from '../../utils/variantes';

interface Props {
  grupos: GrupoAtributo[];
  seleccion: Seleccion;
  onElegir: (idAtributo: number, idValorAtributo: number) => void;
}

/** Un grupo de botones por atributo (Talla, Color…) a partir de `variantes[].valores`. */
export function VariantSelector({ grupos, seleccion, onElegir }: Props) {
  if (grupos.length === 0) return null;
  return (
    <div className="space-y-4">
      {grupos.map((grupo) => (
        <div key={grupo.idAtributo} role="group" aria-label={grupo.atributo}>
          <p className="text-sm font-medium text-texto-suave">{grupo.atributo}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {grupo.valores.map((valor) => {
              const activo = seleccion[grupo.idAtributo] === valor.idValorAtributo;
              return (
                <button
                  key={valor.idValorAtributo}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onElegir(grupo.idAtributo, valor.idValorAtributo)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario ${
                    activo
                      ? 'border-primario bg-acento-suave font-medium text-acento ring-1 ring-primario'
                      : 'border-borde-fuerte bg-superficie text-texto-suave hover:border-texto-tenue hover:text-texto'
                  }`}
                >
                  {valor.valor}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
