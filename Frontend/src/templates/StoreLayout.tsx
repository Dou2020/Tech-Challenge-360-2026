import { LogIn } from 'lucide-react';
import { Link, Outlet, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Logo } from '../components/atoms';
import { SearchBox, ThemeToggle } from '../components/molecules';
import { AccountMenu, CartButton } from '../components/organisms';
import { useTiempoRealPedidos } from '../hooks/useTiempoRealPedidos';

/** Tienda pública: buscador, carrito, menú de cuenta (o acceso al login) y pie con el tema. */
export function StoreLayout() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Operador y Administrador no tienen carrito.
  const tieneCarrito = !usuario || usuario.rol === 'Cliente';
  // "Mis pedidos" al día cuando el personal cambia un pedido del Cliente (stream SSE).
  useTiempoRealPedidos(usuario?.rol === 'Cliente');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-borde bg-fondo/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Logo />

          <SearchBox
            className="order-last w-full sm:order-none sm:max-w-md sm:flex-1"
            etiqueta="Buscar productos"
            placeholder="Buscar productos…"
            valor={params.get('q') ?? ''}
            onBuscar={(q) => navigate(q ? `/catalogo?q=${encodeURIComponent(q)}` : '/catalogo')}
          />

          <nav aria-label="Principal" className="ml-auto flex items-center gap-1 text-sm">
            <Link
              to="/catalogo"
              className="hidden rounded-lg px-3 py-2 font-medium text-texto-suave transition-colors hover:bg-superficie-suave hover:text-texto sm:inline"
            >
              Catálogo
            </Link>
            {tieneCarrito && <CartButton />}
            {usuario ? (
              <AccountMenu />
            ) : (
              <Link
                to="/login"
                className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-primario px-3 py-2 font-medium text-sobre-primario shadow-xs transition-colors hover:bg-primario-hover"
              >
                <LogIn className="size-4" aria-hidden />
                Iniciar sesión
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-10">
        <Outlet />
      </main>

      <footer className="border-t border-borde">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-texto-tenue">
          <p>ShopCart · Precios en quetzales con IVA incluido</p>
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
}
