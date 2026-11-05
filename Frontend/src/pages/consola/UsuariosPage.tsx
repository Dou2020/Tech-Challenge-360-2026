import { useState } from 'react';
import { Badge, Button, Select } from '../../components/atoms';
import { ConfirmationDialog, Notice, PageHeading, SearchBox } from '../../components/molecules';
import { DataTable, UserForm, type Columna } from '../../components/organisms';
import { useAuth } from '../../auth/useAuth';
import {
  useActualizarUsuario,
  useCambiarEstadoUsuario,
  useCrearUsuario,
  useReenviarInvitacion,
  useUsuarios,
} from '../../hooks/queries';
import { useServerTable } from '../../hooks/useServerTable';
import { ApiError } from '../../services/http';
import type { UsuarioAdmin } from '../../types/administracion';
import { formatearFecha } from '../../utils/format';
import { avisoExito, avisoInfo, errorNotice, type Aviso } from '../../utils/notice';

/** Mensajes propios de la invitación según el código de error de la API. */
const MENSAJES_INVITACION: Record<string, string> = {
  CONTRASENA_YA_CREADA: 'Este usuario ya creó su contraseña: no necesita invitación.',
  USUARIO_INACTIVO: 'El usuario está inactivo: actívalo antes de reenviar la invitación.',
  SERVICIO_NO_DISPONIBLE: 'El servicio no está disponible por ahora. Inténtalo de nuevo más tarde.',
};

const FILTROS = ['q', 'rol', 'activo'] as const;

type Panel = { modo: 'crear' } | { modo: 'editar'; usuario: UsuarioAdmin } | null;

/** Usuarios internos y clientes (Administrador): alta de personal, edición y activación. */
export default function UsuariosPage() {
  const { usuario: yo } = useAuth();
  const tabla = useServerTable({
    filtros: FILTROS,
    sortPorDefecto: 'nombre:asc',
    pageSizePorDefecto: 20,
  });
  const { filtros } = tabla;
  const usuarios = useUsuarios(tabla.params);
  const crear = useCrearUsuario();
  const actualizar = useActualizarUsuario();
  const cambiarEstado = useCambiarEstadoUsuario();
  const reenviar = useReenviarInvitacion();
  const [panel, setPanel] = useState<Panel>(null);
  const [aCambiar, setACambiar] = useState<UsuarioAdmin | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const hayFiltros = FILTROS.some((f) => filtros[f] !== '');

  const columnas: Columna<UsuarioAdmin>[] = [
    {
      clave: 'nombre',
      titulo: 'Nombre',
      orden: 'nombre',
      celda: (u) => (
        <>
          <span className="font-medium">
            {u.nombre} {u.apellido}
          </span>
          {u.idUsuario === yo?.idUsuario && (
            <span className="ml-2 text-xs text-texto-tenue">(tú)</span>
          )}
        </>
      ),
    },
    { clave: 'correo', titulo: 'Correo', orden: 'correo', celda: (u) => u.correo },
    { clave: 'rol', titulo: 'Rol', orden: 'rol', celda: (u) => u.rol },
    {
      clave: 'estado',
      titulo: 'Estado',
      celda: (u) => (
        <span className="inline-flex gap-1">
          <Badge tono={u.activo ? 'verde' : 'gris'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
          {u.contrasenaPendiente && <Badge tono="ambar">Pendiente</Badge>}
        </span>
      ),
    },
    {
      clave: 'creado',
      titulo: 'Creado',
      orden: 'fechaCreacion',
      celda: (u) => <span className="text-texto-suave">{formatearFecha(u.fechaCreacion)}</span>,
    },
    {
      clave: 'acciones',
      titulo: 'Acciones',
      tituloOculto: true,
      alinear: 'derecha',
      celda: (u) => (
        <span className="inline-flex gap-2">
          <Button
            variante="secondary"
            className="px-3 py-1.5 text-xs"
            aria-label={`Editar a ${u.nombre} ${u.apellido}`}
            onClick={() => setPanel({ modo: 'editar', usuario: u })}
          >
            Editar
          </Button>
          {u.contrasenaPendiente && u.activo && (
            <Button
              variante="secondary"
              className="px-3 py-1.5 text-xs"
              aria-label={`Reenviar invitación a ${u.nombre} ${u.apellido}`}
              disabled={reenviar.isPending}
              onClick={() => reenviarInvitacion(u)}
            >
              Reenviar invitación
            </Button>
          )}
          {/* Un administrador no puede desactivarse a sí mismo: el botón ni se ofrece. */}
          {u.idUsuario !== yo?.idUsuario && (
            <Button
              variante="secondary"
              className="px-3 py-1.5 text-xs"
              aria-label={`${u.activo ? 'Desactivar' : 'Activar'} a ${u.nombre} ${u.apellido}`}
              onClick={() => setACambiar(u)}
            >
              {u.activo ? 'Desactivar' : 'Activar'}
            </Button>
          )}
        </span>
      ),
    },
  ];

  function reenviarInvitacion(objetivo: UsuarioAdmin) {
    reenviar.mutate(objetivo.idUsuario, {
      onSuccess: (r) => setAviso(avisoExito(r.mensaje)),
      onError: (error) =>
        setAviso(errorNotice(error, 'No se pudo reenviar la invitación.', MENSAJES_INVITACION)),
    });
  }

  function confirmarEstado() {
    if (!aCambiar) return;
    const objetivo = aCambiar;
    cambiarEstado.mutate(
      { id: objetivo.idUsuario, activo: !objetivo.activo },
      {
        onSuccess: () =>
          setAviso(
            avisoExito(
              objetivo.activo
                ? `${objetivo.nombre} fue desactivado y sus sesiones se cerraron.`
                : `${objetivo.nombre} fue activado.`,
            ),
          ),
        onError: (error) =>
          setAviso(
            error instanceof ApiError && error.code === 'EN_USO'
              ? {
                  tipo: 'error',
                  mensaje:
                    'No se puede desactivar: no puedes desactivarte a ti mismo ni al último Administrador activo.',
                  referencia: error.requestId,
                }
              : errorNotice(error, 'No se pudo cambiar el estado.'),
          ),
        onSettled: () => setACambiar(null),
      },
    );
  }

  return (
    <>
      <PageHeading
        titulo="Usuarios"
        descripcion="Crea Operadores y Administradores. Los clientes se registran solos."
        accion={
          <Button onClick={() => setPanel({ modo: 'crear' })} disabled={panel?.modo === 'crear'}>
            Nuevo usuario
          </Button>
        }
      />

      {aviso && (
        <div className="mb-4">
          <Notice aviso={aviso} onCerrar={() => setAviso(null)} />
        </div>
      )}

      {panel && (
        <section aria-labelledby="titulo-panel-usuario" className="tarjeta mb-4 p-5">
          <h2 id="titulo-panel-usuario" className="mb-3 font-semibold tracking-tight text-texto">
            {panel.modo === 'editar'
              ? `Editar a ${panel.usuario.nombre} ${panel.usuario.apellido}`
              : 'Nuevo usuario'}
          </h2>
          {panel.modo === 'editar' ? (
            <UserForm
              key={panel.usuario.idUsuario}
              usuario={panel.usuario}
              onCancelar={() => setPanel(null)}
              onGuardar={async (datos) => {
                await actualizar.mutateAsync({ id: panel.usuario.idUsuario, datos });
                const propioCambio =
                  panel.usuario.idUsuario === yo?.idUsuario && datos.rol !== panel.usuario.rol;
                setAviso(
                  propioCambio
                    ? avisoInfo(
                        'Cambiaste tu propio rol: tu sesión actual se revocó y se te pedirá iniciar sesión de nuevo.',
                      )
                    : avisoExito('Usuario actualizado.'),
                );
                setPanel(null);
              }}
            />
          ) : (
            <UserForm
              onCancelar={() => setPanel(null)}
              onGuardar={async (datos) => {
                await crear.mutateAsync(datos);
                setAviso(
                  avisoExito(
                    `Usuario ${datos.nombre} ${datos.apellido} creado: se le envió una invitación por correo para crear su contraseña.`,
                  ),
                );
                setPanel(null);
              }}
            />
          )}
        </section>
      )}

      <div className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <p className="text-sm font-medium text-texto-suave">Nombre o correo</p>
          <SearchBox
            className="mt-1"
            etiqueta="Buscar usuario por nombre o correo"
            valor={filtros.q}
            onBuscar={(q) => tabla.setFiltros({ q })}
          />
        </div>
        <Select
          label="Rol"
          value={filtros.rol}
          onChange={(e) => tabla.setFiltros({ rol: e.target.value })}
        >
          <option value="">Todos</option>
          <option value="Cliente">Cliente</option>
          <option value="Operador">Operador</option>
          <option value="Administrador">Administrador</option>
        </Select>
        <Select
          label="Estado"
          value={filtros.activo}
          onChange={(e) => tabla.setFiltros({ activo: e.target.value })}
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </Select>
        {hayFiltros && (
          <div className="flex items-end">
            <Button variante="ghost" onClick={tabla.limpiarFiltros}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      <DataTable
        titulo="Lista de usuarios"
        columnas={columnas}
        consulta={usuarios}
        tabla={tabla}
        idFila={(u) => u.idUsuario}
        vacio={{
          titulo: hayFiltros ? 'No hay usuarios con esos filtros' : 'Aún no hay usuarios',
          descripcion: hayFiltros ? 'Prueba con otros filtros.' : undefined,
          accion: hayFiltros ? (
            <Button onClick={tabla.limpiarFiltros}>Limpiar filtros</Button>
          ) : undefined,
        }}
      />

      <ConfirmationDialog
        abierto={aCambiar !== null}
        titulo={
          aCambiar?.activo
            ? `¿Desactivar a ${aCambiar.nombre} ${aCambiar.apellido}?`
            : `¿Activar a ${aCambiar?.nombre ?? ''} ${aCambiar?.apellido ?? ''}?`
        }
        descripcion={
          aCambiar?.activo
            ? 'Se cerrarán todas sus sesiones al instante y no podrá volver a entrar hasta que lo actives.'
            : 'Podrá iniciar sesión de nuevo.'
        }
        textoConfirmar={aCambiar?.activo ? 'Desactivar' : 'Activar'}
        cargando={cambiarEstado.isPending}
        onConfirmar={confirmarEstado}
        onCancelar={() => setACambiar(null)}
      />
    </>
  );
}
