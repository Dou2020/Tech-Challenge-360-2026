import { Outlet } from 'react-router';
import { Logo } from '../components/atoms';
import { ThemeToggle } from '../components/molecules';

/** Login, registro y contraseñas: panel de marca en pantallas grandes y el formulario en una tarjeta. */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-linear-to-br from-marca-700 via-marca-800 to-marca-950 p-12 text-white lg:flex lg:flex-col lg:justify-end">
        <div
          aria-hidden
          className="absolute -top-32 -right-32 size-96 rounded-full bg-marca-400/30 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-20 size-96 rounded-full bg-marca-300/20 blur-3xl"
        />
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold tracking-tight">Compra fácil en ShopCart</p>
          <p className="mt-3 text-marca-100">
            Encuentra lo que buscas, paga seguro y recibe tu pedido en cualquier parte de Guatemala.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:justify-start">
            <Logo grande />
          </div>
          <div className="tarjeta p-6 sm:p-8">
            <Outlet />
          </div>
          <div className="mt-6 flex justify-center">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
