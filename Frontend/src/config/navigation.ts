import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  Store,
  ShoppingBag,
  Tags,
  TicketPercent,
  Users,
} from 'lucide-react';
import type { Rol } from '../types/auth';

export interface ItemMenu {
  ruta: string;
  titulo: string;
  icono: LucideIcon;
  roles: Rol[];
}

const PERSONAL: Rol[] = ['Operador', 'Administrador'];
const ADMIN: Rol[] = ['Administrador'];

/** Menú de la consola; coincide con la tabla "Rutas y acceso" del README. */
export const menuConsola: ItemMenu[] = [
  { ruta: '/consola', titulo: 'Dashboard', icono: LayoutDashboard, roles: ADMIN },
  { ruta: '/consola/operacion', titulo: 'Operación', icono: ClipboardList, roles: PERSONAL },
  { ruta: '/consola/pedidos', titulo: 'Pedidos', icono: ShoppingBag, roles: PERSONAL },
  { ruta: '/consola/inventario', titulo: 'Inventario', icono: Boxes, roles: PERSONAL },
  { ruta: '/consola/productos', titulo: 'Productos', icono: Package, roles: ADMIN },
  { ruta: '/consola/categorias', titulo: 'Categorías', icono: Tags, roles: ADMIN },
  { ruta: '/consola/sucursales', titulo: 'Sucursales', icono: Store, roles: ADMIN },
  { ruta: '/consola/cupones', titulo: 'Cupones', icono: TicketPercent, roles: ADMIN },
  { ruta: '/consola/usuarios', titulo: 'Usuarios', icono: Users, roles: ADMIN },
  { ruta: '/consola/reportes', titulo: 'Reportes', icono: ChartColumn, roles: ADMIN },
  { ruta: '/consola/bitacora', titulo: 'Bitácora', icono: ScrollText, roles: ADMIN },
  { ruta: '/consola/configuracion', titulo: 'Configuración', icono: Settings, roles: ADMIN },
];

export function menuPorRol(rol: Rol): ItemMenu[] {
  return menuConsola.filter((item) => item.roles.includes(rol));
}

/** Pantalla inicial de cada rol después de iniciar sesión. */
export function inicioPorRol(rol: Rol): string {
  if (rol === 'Administrador') return '/consola';
  if (rol === 'Operador') return '/consola/operacion';
  return '/';
}
