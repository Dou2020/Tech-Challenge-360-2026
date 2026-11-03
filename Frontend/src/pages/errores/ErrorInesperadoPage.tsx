import { TriangleAlert } from 'lucide-react';
import { esErrorDeCarga } from '../../utils/errorCarga';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

/** Pantalla de último recurso del router: un error no controlado al cargar o dibujar una ruta. */
export default function ErrorInesperadoPage() {
  const error = useRouteError();
  const deCarga = esErrorDeCarga(error);
  const titulo = isRouteErrorResponse(error)
    ? `Error ${error.status}`
    : deCarga
      ? 'No se pudo cargar la página'
      : 'Algo salió mal';

  return (
    <div
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center px-4 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-peligro-suave ring-1 ring-peligro-borde">
        <TriangleAlert className="size-7 text-peligro" aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-texto">{titulo}</h1>
      <p className="mt-2 max-w-md text-sm text-texto-suave">
        {deCarga
          ? 'No se pudo descargar una parte de la aplicación. Revisa tu conexión y vuelve a intentarlo.'
          : 'Ocurrió un error inesperado. Puedes volver al inicio e intentarlo de nuevo.'}
      </p>
      {deCarga ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-lg bg-primario px-4 py-2 text-sm font-medium text-sobre-primario shadow-xs transition-colors hover:bg-primario-hover"
        >
          Recargar
        </button>
      ) : (
        <Link
          to="/"
          className="mt-6 rounded-lg bg-primario px-4 py-2 text-sm font-medium text-sobre-primario shadow-xs transition-colors hover:bg-primario-hover"
        >
          Volver al inicio
        </Link>
      )}
    </div>
  );
}
