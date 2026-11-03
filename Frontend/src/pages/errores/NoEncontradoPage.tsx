import { Link } from 'react-router';

export default function NoEncontradoPage() {
  return (
    <div className="py-20 text-center sm:py-28">
      <p className="text-base font-semibold text-acento">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-texto sm:text-4xl">
        Página no encontrada
      </h1>
      <p className="mt-4 text-base text-texto-suave">La dirección que buscas no existe.</p>
      <Link
        to="/"
        className="mt-8 inline-flex rounded-lg bg-primario px-4 py-2 text-sm font-medium text-sobre-primario shadow-xs transition-colors hover:bg-primario-hover"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
