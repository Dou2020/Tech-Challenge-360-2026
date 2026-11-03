import {
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/useAuth';
import { inicioPorRol } from '../../config';

const itemCuenta =
  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-texto-suave transition-colors hover:bg-superficie-suave hover:text-texto';

/** Menú de la cuenta: opciones de Cliente, o acceso a la consola para el personal. */
export function AccountMenu() {
  const { usuario, cerrarSesion } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [abierto]);

  if (!usuario) return null;
  const esCliente = usuario.rol === 'Cliente';

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-texto-suave transition-colors hover:bg-superficie-suave hover:text-texto"
      >
        <User className="size-4" aria-hidden />
        <span className="hidden sm:inline">{usuario.nombre}</span>
        <span className="sm:hidden">Cuenta</span>
        <ChevronDown className="size-4" aria-hidden />
      </button>
      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 rounded-xl bg-superficie p-1.5 shadow-lg ring-1 ring-borde"
          onClick={() => setAbierto(false)}
        >
          {esCliente ? (
            <>
              <Link role="menuitem" to="/cuenta/pedidos" className={itemCuenta}>
                <Package className="size-4" aria-hidden />
                Mis pedidos
              </Link>
              <Link role="menuitem" to="/cuenta/direcciones" className={itemCuenta}>
                <MapPin className="size-4" aria-hidden />
                Direcciones
              </Link>
              <Link role="menuitem" to="/cuenta/tarjetas" className={itemCuenta}>
                <CreditCard className="size-4" aria-hidden />
                Tarjetas
              </Link>
              <Link role="menuitem" to="/cuenta/perfil" className={itemCuenta}>
                <User className="size-4" aria-hidden />
                Perfil
              </Link>
            </>
          ) : (
            <Link role="menuitem" to={inicioPorRol(usuario.rol)} className={itemCuenta}>
              <LayoutDashboard className="size-4" aria-hidden />
              Consola
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void cerrarSesion()}
            className={`${itemCuenta} mt-1 w-full rounded-t-none border-t border-borde`}
          >
            <LogOut className="size-4" aria-hidden />
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
