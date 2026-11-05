import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Button } from '../components/atoms/Button';
import { Logo } from '../components/atoms/Logo';
import { ThemeToggle } from '../components/molecules/ThemeToggle';
import { menuPorRol } from '../config/navigation';

/** Hasta dos iniciales del nombre, para el avatar. */
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

/** Consola interna: menú lateral según el rol (plegable en pantallas pequeñas). */
export function ConsoleLayout() {
  const { usuario, cerrarSesion } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  if (!usuario) return null; // ProtectedRoute garantiza la sesión.

  const menu = (
    <nav aria-label="Menú de la consola" className="space-y-0.5 p-3">
      {menuPorRol(usuario.rol).map(({ ruta, titulo, icono: Icono }) => (
        <NavLink
          key={ruta}
          to={ruta}
          end={ruta === '/consola'}
          onClick={() => setMenuAbierto(false)}
          className={({ isActive }) =>
            `relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-acento-suave text-acento before:absolute before:inset-y-1.5 before:-left-3 before:w-1 before:rounded-r-full before:bg-primario'
                : 'text-texto-suave hover:bg-superficie-suave hover:text-texto'
            }`
          }
        >
          <Icono className="size-4" aria-hidden />
          {titulo}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-borde bg-superficie lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-borde px-6">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto">{menu}</div>
      </aside>

      {menuAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMenuAbierto(false)}
          />
          <aside className="relative h-full w-72 overflow-y-auto border-r border-borde bg-superficie pt-2 shadow-2xl">
            {menu}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-borde bg-fondo/80 px-4 backdrop-blur-lg sm:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-texto-suave transition-colors hover:bg-superficie-suave hover:text-texto lg:hidden"
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMenuAbierto((abierto) => !abierto)}
          >
            {menuAbierto ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <ThemeToggle className="ml-auto" />
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-full bg-acento-suave text-xs font-semibold text-acento ring-1 ring-acento/20"
            >
              {iniciales(usuario.nombre)}
            </span>
            <span className="hidden text-sm text-texto-suave sm:inline">
              {usuario.nombre} · {usuario.rol}
            </span>
          </div>
          <Button variante="ghost" onClick={() => void cerrarSesion()}>
            <LogOut className="size-4" aria-hidden />
            Salir
          </Button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
