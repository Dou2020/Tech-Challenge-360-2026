/** Contrato de los SPs: Database/scripts/007_sp_auth.sql. La fila de usuario es FilaUsuario (auth). */
import type { FilaUsuario } from '../auth/auth.types.js';

/** Fila de SP_Usuarios_Actualizar y SP_Usuarios_CambiarEstado. */
export interface FilaUsuarioModificado extends FilaUsuario {
  RolCambio: boolean;
  ActivoCambio: boolean;
}

export interface FiltrosUsuarios {
  q?: string | undefined;
  rol?: string | undefined;
  activo?: boolean | undefined;
}

export interface DatosUsuarioNuevo {
  correo: string;
  contrasena: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  rol: 'Operador' | 'Administrador';
}

export interface DatosUsuarioActualizado {
  nombre: string;
  apellido: string;
  telefono: string | null;
  /** undefined conserva el rol actual. */
  rol?: string | undefined;
}
