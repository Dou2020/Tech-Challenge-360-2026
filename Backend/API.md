# API de ShopCart

Referencia de todos los endpoints del backend de ShopCart (Node.js 24 + TypeScript + Express). Cada endpoint indica quién puede usarlo y qué stored procedure ejecuta: el backend no contiene SQL, solo llama a `executeSp('SP_Modulo_Proceso', params)`.

La especificación formal está en `backend/src/docs/openapi.yaml` y se sirve en `GET /api/docs`.

## Índice

1. [Convenciones](#1-convenciones)
   - [Base y formato](#base-y-formato)
   - [Autenticación](#autenticación)
   - [Niveles de acceso](#niveles-de-acceso)
   - [Caché](#caché)
   - [Listados paginados](#listados-paginados)
   - [Errores](#errores)
2. [Endpoints](#2-endpoints)
   - [Salud y documentación](#salud-y-documentación)
   - [Autenticación — `/api/auth`](#autenticación--apiauth)
   - [Perfil — `/api/perfil`](#perfil--apiperfil)
   - [Usuarios — `/api/usuarios`](#usuarios--apiusuarios)
   - [Direcciones — `/api/direcciones`](#direcciones--apidirecciones)
   - [Catálogo público — `/api/catalogo`](#catálogo-público--apicatalogo)
   - [Categorías — `/api/categorias`](#categorías--apicategorias)
   - [Productos — `/api/productos`](#productos--apiproductos)
   - [Variantes — `/api/variantes`](#variantes--apivariantes)
   - [Atributos — `/api/atributos`](#atributos--apiatributos)
   - [Inventario — `/api/inventario`](#inventario--apiinventario)
   - [Carrito — `/api/carrito`](#carrito--apicarrito)
   - [Checkout — `/api/checkout`](#checkout--apicheckout)
   - [Pedidos — `/api/pedidos`](#pedidos--apipedidos) (incluye el ciclo de vida del pedido)
   - [Cupones — `/api/cupones`](#cupones--apicupones)
   - [Reportes — `/api/reportes`](#reportes--apireportes)
   - [Bitácora — `/api/bitacora`](#bitácora--apibitacora)
   - [Configuración — `/api/configuracion`](#configuración--apiconfiguracion)
3. [Ejemplos de los flujos críticos](#3-ejemplos-de-los-flujos-críticos)
   - [Login](#login)
   - [Refresh](#refresh)
   - [Agregar al carrito](#agregar-al-carrito)
   - [Aplicar cupón](#aplicar-cupón)
   - [Iniciar checkout](#iniciar-checkout)
   - [Pago idempotente](#pago-idempotente)
   - [Cambiar estado de un pedido](#cambiar-estado-de-un-pedido)
   - [Registrar una devolución](#registrar-una-devolución)
   - [Ajuste de inventario](#ajuste-de-inventario)
4. [Catálogo de códigos de error](#4-catálogo-de-códigos-de-error)
5. [Extras opcionales](#5-extras-opcionales)
6. [Procesos sin endpoint](#6-procesos-sin-endpoint)
7. [Decisiones tomadas](#7-decisiones-tomadas)

---

## 1. Convenciones

### Base y formato
- URL base: `/api`. Todas las peticiones y respuestas son JSON (`Content-Type: application/json`).
- Recursos en español y en plural: `/api/productos`, `/api/pedidos`.
- Montos como **string decimal con 2 decimales** (`"125.50"`), en quetzales con IVA incluido. Así no se pierde precisión al pasar por JavaScript.
- Fechas en ISO 8601 UTC (`2026-11-03T15:30:00Z`). El frontend las muestra en `America/Guatemala`.

### Autenticación
| Elemento | Detalle |
| :--- | :--- |
| Access token | JWT de 15 minutos en `Authorization: Bearer <token>` |
| Refresh token | Cookie `refreshToken` con `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`, válida 7 días. Se rota en cada uso. La sesión se guarda en Redis (solo el hash SHA-256 del token) |
| Revocación | El access token lleva `jti` y `sid` (sesión). Tras logout, desactivación, cambio de contraseña o de rol, deja de aceptarse de inmediato aunque no haya expirado (lista de revocación en Redis) |
| Bloqueo de login | Tras `LOGIN_MAX_INTENTOS` (5) fallos con el mismo correo, el login se bloquea `LOGIN_BLOQUEO_MIN` (15) minutos → `429 CUENTA_BLOQUEADA` con header `Retry-After` |
| Carrito de invitado | Header `X-Cart-Token: <uuid>` |
| Pago | Header `Idempotency-Key: <uuid v4>` obligatorio en `POST /api/checkout/pagar` |

### Niveles de acceso
| Acceso | Significado |
| :--- | :--- |
| **Público** | Sin autenticación |
| **Invitado** | Sin autenticación, identificado por `X-Cart-Token` |
| **Autenticado** | Cualquier rol con access token válido |
| **Cliente** | Rol Cliente; solo ve y modifica sus propios datos (el `IDUsuario` sale del token) |
| **Operador** | Rol Operador |
| **Admin** | Rol Administrador |

Si un Cliente pide un recurso que no es suyo (pedido, carrito, dirección), el SP no lo encuentra y la API responde **404**, sin revelar si existe.

### Caché
Los endpoints de reportes, catálogo público, métodos de envío y configuración se sirven desde Redis cuando es posible. Sus respuestas incluyen el header `X-Cache: HIT` (desde caché) o `X-Cache: MISS` (desde la base). La existencia disponible nunca se cachea.

### Listados paginados
Todos los listados aceptan:

| Parámetro | Tipo | Default | Detalle |
| :--- | :--- | :--- | :--- |
| `page` | int | 1 | Página, desde 1 |
| `pageSize` | int | 20 | Máximo 100 |
| `sort` | string | depende del recurso | `campo:asc` o `campo:desc`; solo campos permitidos por endpoint |

El backend valida `sort` contra la lista del endpoint y lo pasa tal cual al SP: `@Pagina INT`, `@TamanoPagina INT`, `@Orden NVARCHAR(50)` (por ejemplo `N'precio:desc'`). El SP elige la columna con un `CASE` sobre esos valores; nunca los concatena.

Respuesta:
```json
{
  "items": [ ],
  "page": 1,
  "pageSize": 20,
  "total": 134
}
```

### Errores
Todas las respuestas de error tienen el mismo formato:
```json
{
  "error": {
    "code": "VALIDACION",
    "message": "La solicitud tiene datos inválidos.",
    "details": [
      { "field": "cantidad", "message": "Debe ser un entero mayor que 0." }
    ]
  },
  "requestId": "6f1c2b0e-3d0a-4c55-9a51-1b7f0e2d9c11"
}
```
El catálogo completo de códigos está en la [sección 4](#4-catálogo-de-códigos-de-error).

---

## 2. Endpoints

### Salud y documentación
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/health` | Público | Estado del servicio y de las conexiones a SQL Server y Redis (`"up"` o `"down"`) | `SP_Sistema_VerificarConexion` |
| GET | `/api/docs` | Público | Swagger UI generado desde `openapi.yaml` | — |

### Autenticación — `/api/auth`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| POST | `/api/auth/registro` | Público | Registra un Cliente (correo, contraseña, nombre, apellido, teléfono). Devuelve 201 con los tokens, igual que el login | `SP_Auth_RegistrarCliente` |
| POST | `/api/auth/login` | Público | Valida credenciales; crea la sesión en Redis, devuelve el access token y deja la cookie de refresh. Un usuario inactivo recibe 403; tras 5 fallos, 429 `CUENTA_BLOQUEADA` | `SP_Auth_ObtenerUsuarioPorCorreo` + Redis |
| POST | `/api/auth/refresh` | Cookie | Rota el refresh token en Redis (script Lua atómico) y devuelve un access token nuevo con el rol y estado actuales del usuario. Si se reutiliza un token ya rotado, se revoca toda la sesión | Redis + `SP_Usuarios_ObtenerPorId` (con caché) |
| POST | `/api/auth/logout` | Cookie | Revoca el access token actual y la sesión, y borra la cookie. Responde 204 | Redis |
| GET | `/api/auth/me` | Autenticado | Usuario de la sesión: id, nombre, correo y rol | `SP_Usuarios_ObtenerPorId` |

### Perfil — `/api/perfil`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/perfil` | Autenticado | Datos del propio usuario | `SP_Usuarios_ObtenerPorId` |
| PUT | `/api/perfil` | Autenticado | Actualiza nombre, apellido y teléfono | `SP_Usuarios_ActualizarPerfil` |
| PUT | `/api/perfil/contrasena` | Autenticado | Cambia la contraseña (pide la actual) y revoca los demás refresh tokens | `SP_Usuarios_CambiarContrasena` |

### Usuarios — `/api/usuarios`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/usuarios` | Admin | Lista paginada. Filtros: `q` (nombre o correo), `rol`, `activo` | `SP_Usuarios_Listar` |
| GET | `/api/usuarios/:id` | Admin | Detalle de un usuario | `SP_Usuarios_ObtenerPorId` |
| POST | `/api/usuarios` | Admin | Crea un Operador o Administrador | `SP_Usuarios_Crear` |
| PUT | `/api/usuarios/:id` | Admin | Actualiza nombre, teléfono y rol | `SP_Usuarios_Actualizar` |
| PATCH | `/api/usuarios/:id/estado` | Admin | Activa o desactiva (`{ "activo": false }`). Desactivar revoca sus refresh tokens. Un Admin no puede desactivarse a sí mismo (409) | `SP_Usuarios_CambiarEstado` |

### Direcciones — `/api/direcciones`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/direcciones` | Cliente | Direcciones activas del cliente | `SP_Direcciones_ListarPorUsuario` |
| POST | `/api/direcciones` | Cliente | Crea una dirección (alias, destinatario, teléfono, líneas, municipio, departamento, referencias) | `SP_Direcciones_Crear` |
| PUT | `/api/direcciones/:id` | Cliente | Actualiza una dirección propia | `SP_Direcciones_Actualizar` |
| DELETE | `/api/direcciones/:id` | Cliente | Baja lógica. Los pedidos conservan su copia de la dirección. Responde 204 | `SP_Direcciones_Desactivar` |

### Catálogo público — `/api/catalogo`
Solo muestra categorías, productos y variantes activos.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/catalogo/categorias` | Público | Categorías activas | `SP_Catalogo_ListarCategorias` |
| GET | `/api/catalogo/productos` | Público | Búsqueda paginada. Filtros: `q` (texto), `idCategoria`, `precioMin`, `precioMax`, `disponible` (true = con existencia disponible). `sort`: `precio`, `nombre`, `fechaCreacion` | `SP_Catalogo_BuscarProductos` |
| GET | `/api/catalogo/productos/:id` | Público | Detalle: imágenes y variantes con SKU, atributos, precio y existencia disponible | `SP_Catalogo_ObtenerProducto` |
| GET | `/api/metodos-envio` | Público | Métodos de envío activos con costo y días estimados | `SP_Checkout_ListarMetodosEnvio` |

### Categorías — `/api/categorias`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/categorias` | Admin | Lista paginada, incluye inactivas. Filtros: `q`, `activo` | `SP_Categorias_Listar` |
| GET | `/api/categorias/:id` | Admin | Detalle | `SP_Categorias_ObtenerPorId` |
| POST | `/api/categorias` | Admin | Crea una categoría (nombre único) | `SP_Categorias_Crear` |
| PUT | `/api/categorias/:id` | Admin | Actualiza nombre y descripción | `SP_Categorias_Actualizar` |
| PATCH | `/api/categorias/:id/estado` | Admin | Activa o desactiva | `SP_Categorias_CambiarEstado` |
| DELETE | `/api/categorias/:id` | Admin | Elimina solo si no tiene productos ni cupones; si los tiene, 409 `EN_USO` | `SP_Categorias_Eliminar` |

### Productos — `/api/productos`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/productos` | Admin | Lista paginada, incluye inactivos. Filtros: `q`, `idCategoria`, `activo` | `SP_Productos_Listar` |
| GET | `/api/productos/:id` | Admin | Detalle con variantes (existencia física y reservada) e imágenes | `SP_Productos_ObtenerPorId` |
| POST | `/api/productos` | Admin | Crea el producto con sus variantes en una sola transacción. Las variantes se envían al SP como JSON (`OPENJSON`). La existencia inicial entra como movimiento de kardex. Cada variante lleva como máximo un valor por atributo; si repite un atributo: 400 `VALIDACION` | `SP_Productos_Crear` |
| PUT | `/api/productos/:id` | Admin | Actualiza nombre, descripción y categoría | `SP_Productos_Actualizar` |
| PATCH | `/api/productos/:id/estado` | Admin | Activa o desactiva; un producto inactivo deja de verse en la tienda | `SP_Productos_CambiarEstado` |
| DELETE | `/api/productos/:id` | Admin | Elimina solo si nunca se vendió; si tiene ventas, 409 `PRODUCTO_CON_VENTAS` (se debe desactivar) | `SP_Productos_Eliminar` |
| POST | `/api/productos/:id/imagenes` | Admin | Agrega una imagen por URL (`url`, `orden`, `esPrincipal`) | `SP_Productos_AgregarImagen` |
| DELETE | `/api/productos/:id/imagenes/:idImagen` | Admin | Quita una imagen | `SP_Productos_EliminarImagen` |
| POST | `/api/productos/:id/variantes` | Admin | Agrega una variante (SKU, valores de atributo, precio, existencia inicial). Los valores se envían por `idValorAtributo`, como máximo uno por atributo; si repite un atributo: 400 `VALIDACION` | `SP_Variantes_Crear` |

### Variantes — `/api/variantes`
La existencia **no** se modifica aquí: solo cambia por movimientos de inventario, pedidos, cancelaciones y devoluciones.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| PUT | `/api/variantes/:id` | Admin | Actualiza SKU y valores de atributo (como máximo uno por atributo; si repite un atributo: 400 `VALIDACION`) | `SP_Variantes_Actualizar` |
| PATCH | `/api/variantes/:id/precio` | Admin | Cambia el precio (`{ "precio": "149.00" }`). Queda en la bitácora; no altera pedidos ya realizados | `SP_Variantes_CambiarPrecio` |
| PATCH | `/api/variantes/:id/estado` | Admin | Activa o desactiva la variante | `SP_Variantes_CambiarEstado` |

### Atributos — `/api/atributos`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/atributos` | Admin | Atributos con sus valores (Talla: S, M, L; Color: Rojo, Azul) | `SP_Atributos_Listar` |
| POST | `/api/atributos` | Admin | Crea un atributo | `SP_Atributos_Crear` |
| POST | `/api/atributos/:id/valores` | Admin | Agrega un valor a un atributo | `SP_Atributos_AgregarValor` |

### Inventario — `/api/inventario`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/inventario/existencias` | Operador, Admin | Lista paginada por variante: existencia física, reservada y disponible. Filtros: `q` (SKU o nombre), `idCategoria`, `bajoStock` (disponible ≤ umbral) | `SP_Inventario_ListarExistencias` |
| GET | `/api/inventario/variantes/:idVariante/kardex` | Operador, Admin | Movimientos de la variante, paginados. Filtros: `desde`, `hasta`, `tipo` | `SP_Inventario_ConsultarKardex` |
| POST | `/api/inventario/entradas` | Operador, Admin | Entrada por compra (`idVariante`, `cantidad`, `motivo`) | `SP_Inventario_RegistrarEntrada` |
| POST | `/api/inventario/ajustes` | Operador, Admin | Ajuste manual (`idVariante`, `tipo`: `ENTRADA` o `SALIDA`, `cantidad`, `motivo` obligatorio). Si dejaría la existencia en negativo o por debajo de lo reservado: 422 `EXISTENCIA_NEGATIVA` | `SP_Inventario_RegistrarAjuste` |
| GET | `/api/inventario/tipos-movimiento` | Operador, Admin | Tipos de movimiento para el filtro del kardex | `SP_Inventario_ListarTiposMovimiento` |

### Carrito — `/api/carrito`
Funciona para invitados (con `X-Cart-Token`) y para clientes (con su token). Todas las respuestas devuelven el carrito completo con los montos calculados por el backend.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/carrito` | Invitado, Cliente | Carrito actual: líneas, cupón, subtotal, descuento y total. Marca las líneas cuya cantidad ya supera lo disponible | `SP_Carrito_Obtener` |
| POST | `/api/carrito/items` | Invitado, Cliente | Agrega una variante (`idVariante`, `cantidad`); si ya está, suma. Crea el carrito si no existe y al invitado le devuelve `tokenInvitado`. Si supera lo disponible: 409 `STOCK_INSUFICIENTE` | `SP_Carrito_AgregarItem` |
| PATCH | `/api/carrito/items/:idVariante` | Invitado, Cliente | Cambia la cantidad de una línea (mismo control de existencia) | `SP_Carrito_ActualizarCantidad` |
| DELETE | `/api/carrito/items/:idVariante` | Invitado, Cliente | Quita una línea | `SP_Carrito_EliminarItem` |
| DELETE | `/api/carrito` | Invitado, Cliente | Vacía el carrito | `SP_Carrito_Vaciar` |
| POST | `/api/carrito/cupon` | Cliente | Aplica un cupón (`{ "codigo": "BIENVENIDA10" }`). Si no es válido, 422 con el código exacto del motivo (`CUPON_VENCIDO`, `CUPON_AGOTADO`, `CUPON_MINIMO_NO_ALCANZADO`…). Reemplaza al cupón anterior: solo uno por pedido | `SP_Carrito_AplicarCupon` |
| DELETE | `/api/carrito/cupon` | Cliente | Quita el cupón | `SP_Carrito_QuitarCupon` |
| POST | `/api/carrito/fusionar` | Cliente | Pasa el carrito de invitado (`tokenInvitado`) al carrito del cliente; suma cantidades sin superar lo disponible | `SP_Carrito_FusionarInvitado` |

### Checkout — `/api/checkout`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| POST | `/api/checkout/iniciar` | Cliente | Recibe `idDireccion` e `idMetodoEnvio`. Revalida el cupón, reserva la existencia de cada línea por 15 minutos y devuelve el resumen final (subtotal, descuento, envío, IVA, total) con `reservaExpiraEn`. Si ya había una reserva activa, la reemplaza. Si falta existencia: 409 `STOCK_INSUFICIENTE` con las variantes afectadas. Si la dirección no existe, está dada de baja o es de otro cliente: 404 `NO_ENCONTRADO` | `SP_Inventario_ReservarExistencia` |
| GET | `/api/checkout` | Cliente | Resumen y reserva vigente (para retomar el checkout tras recargar la página) | `SP_Checkout_ObtenerResumen` |
| DELETE | `/api/checkout/reserva` | Cliente | Libera la reserva (el cliente vuelve al carrito). Responde 204 | `SP_Inventario_LiberarReserva` |
| POST | `/api/checkout/pagar` | Cliente | Requiere `Idempotency-Key`. Procesa el pago (simulado) y crea el pedido de forma atómica: pedido, detalle con precios congelados, movimientos de kardex, uso del cupón y pago. `metodoPago` solo acepta `TARJETA`. Ver [Pago idempotente](#pago-idempotente) | `SP_Pedidos_CrearPedido` |

### Pedidos — `/api/pedidos`
El Cliente solo ve sus pedidos (el filtro sale del token). Operador y Administrador ven todos.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/pedidos` | Cliente, Operador, Admin | Lista paginada. Filtros: `estado`, `idCliente` (solo personal), `desde`, `hasta`, `q` (número de pedido). `sort`: `fechaCreacion`, `total` | `SP_Pedidos_Listar` |
| GET | `/api/pedidos/estados` | Autenticado | Estados del pedido y transiciones permitidas, para la interfaz | `SP_Pedidos_ListarTransiciones` |
| GET | `/api/pedidos/:id` | Cliente (propio), Operador, Admin | Detalle: líneas con precios congelados, montos, dirección de entrega, pago y estado | `SP_Pedidos_ObtenerPorId` |
| GET | `/api/pedidos/:id/historial` | Cliente (propio), Operador, Admin | Cambios de estado: anterior, nuevo, usuario y fecha | `SP_Pedidos_ObtenerHistorialEstados` |
| POST | `/api/pedidos/:id/cancelar` | Cliente (propio), Operador, Admin | Cancela si aún no se despachó (`motivo` opcional). Reintegra la existencia con movimientos de kardex y libera el uso del cupón. Si ya se despachó: 409 `TRANSICION_NO_PERMITIDA` | `SP_Pedidos_Cancelar` |
| PATCH | `/api/pedidos/:id/estado` | Operador, Admin | Avanza el estado (`estado`, `comentario`). Solo transiciones definidas en `TransicionEstadoPedido`; otra, o el mismo estado en que ya está: 409 `TRANSICION_NO_PERMITIDA` | `SP_Pedidos_CambiarEstado` |
| GET | `/api/pedidos/:id/devoluciones` | Cliente (propio), Operador, Admin | Devoluciones del pedido con sus líneas | `SP_Pedidos_ListarDevoluciones` |
| POST | `/api/pedidos/:id/devoluciones` | Operador, Admin | Registra una devolución total o parcial por línea. Solo para pedidos entregados. Reintegra la existencia por kardex. Cada línea (`idPedidoDetalle`) debe ser de ese pedido y aparecer una sola vez; si no: 400 `VALIDACION`. Si una cantidad supera lo vendido menos lo ya devuelto: 422 `CANTIDAD_DEVOLUCION_EXCEDIDA` | `SP_Pedidos_RegistrarDevolucion` |

**Ciclo de vida del pedido:**

| Estado | Transiciones permitidas | Quién |
| :--- | :--- | :--- |
| `PAGADO` | `EN_PREPARACION`, `CANCELADO` | Operador, Admin (Cliente solo `CANCELADO`) |
| `EN_PREPARACION` | `DESPACHADO`, `CANCELADO` | Operador, Admin (Cliente solo `CANCELADO`) |
| `DESPACHADO` | `ENTREGADO` | Operador, Admin |
| `ENTREGADO` | `DEVUELTO_PARCIAL`, `DEVUELTO` (al registrar una devolución) | Operador, Admin |
| `DEVUELTO_PARCIAL` | `DEVUELTO` (otra devolución parcial lo mantiene en `DEVUELTO_PARCIAL`) | Operador, Admin |
| `CANCELADO`, `DEVUELTO` | — (finales) | — |

### Cupones — `/api/cupones`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/cupones` | Admin | Lista paginada. Filtros: `q` (código), `activo`, `vigente` | `SP_Cupones_Listar` |
| GET | `/api/cupones/:id` | Admin | Detalle con usos actuales | `SP_Cupones_ObtenerPorId` |
| POST | `/api/cupones` | Admin | Crea un cupón: `codigo`, `tipoDescuento` (`PORCENTAJE` o `MONTO_FIJO`), `valor`, `idCategoria` (opcional; sin ella aplica a todo el carrito), `montoMinimo`, `fechaInicio`, `fechaFin`, `limiteUsosTotal`, `limiteUsosPorCliente` | `SP_Cupones_Crear` |
| PUT | `/api/cupones/:id` | Admin | Actualiza el cupón. No permite bajar `limiteUsosTotal` por debajo de los usos actuales (400 `VALIDACION`) | `SP_Cupones_Actualizar` |
| PATCH | `/api/cupones/:id/estado` | Admin | Activa o desactiva | `SP_Cupones_CambiarEstado` |
| DELETE | `/api/cupones/:id` | Admin | Elimina solo si ningún pedido (aunque esté cancelado) ni carrito lo tiene; si no, 409 `EN_USO` y se debe desactivar | `SP_Cupones_Eliminar` |
| GET | `/api/cupones/:id/usos` | Admin | Usos del cupón: cliente, pedido, descuento (el de `Pedido.Descuento`) y fecha. Los pedidos cancelados ya no cuentan como uso | `SP_Cupones_ListarUsos` |

### Reportes — `/api/reportes`
Los reportes solo cuentan pedidos completados (`ENTREGADO` y `DEVUELTO_PARCIAL`), excluyen los cancelados y descuentan lo devuelto. Todos aceptan `desde` y `hasta`. El listado de pedidos con filtros por estado, cliente y fechas es `GET /api/pedidos`.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/reportes/resumen` | Admin | Indicadores del dashboard: ventas netas, número de pedidos, ticket promedio, unidades vendidas y carritos abandonados | `SP_Reportes_ResumenDashboard` |
| GET | `/api/reportes/ventas` | Admin | Serie de ventas en quetzales y número de pedidos. `agrupacion`: `dia`, `semana` o `mes` | `SP_Reportes_VentasPorPeriodo` |
| GET | `/api/reportes/ventas-por-categoria` | Admin | Ventas netas y unidades por categoría (usa `VW_Dashboard_VentasPorCategoria`) | `SP_Reportes_VentasPorCategoria` |
| GET | `/api/reportes/productos-mas-vendidos` | Admin | Productos más vendidos del periodo. `limite` (default 10) | `SP_Reportes_ProductosMasVendidos` |
| GET | `/api/reportes/carritos-abandonados` | Admin | Carritos con productos sin actividad por más de `HorasCarritoAbandonado`, paginados | `SP_Reportes_CarritosAbandonados` |

### Bitácora — `/api/bitacora`
Solo lectura: no existe ningún endpoint que modifique o elimine registros, y la tabla además está protegida con un trigger.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/bitacora` | Admin | Lista paginada. Filtros: `modulo`, `entidad`, `idRegistro`, `idUsuario`, `accion`, `desde`, `hasta` | `SP_Bitacora_Listar` |
| GET | `/api/bitacora/modulos` | Admin | Módulos disponibles para el filtro | `SP_Bitacora_ListarModulos` |

### Configuración — `/api/configuracion`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/configuracion` | Admin | Parámetros: `MinutosReserva`, `HorasCarritoAbandonado`, `PorcentajeIVA` | `SP_Configuracion_Listar` |
| PUT | `/api/configuracion/:clave` | Admin | Cambia el valor de un parámetro (queda en la bitácora) | `SP_Configuracion_Actualizar` |

---

## 3. Ejemplos de los flujos críticos

### Login
```http
POST /api/auth/login
Content-Type: application/json

{ "correo": "cliente@shopcart.gt", "contrasena": "Cliente#2026" }
```
```http
HTTP/1.1 200 OK
Set-Cookie: refreshToken=…; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800

{
  "accessToken": "eyJhbGciOi…",
  "expiraEn": 900,
  "usuario": { "idUsuario": 12, "nombre": "Ana", "correo": "cliente@shopcart.gt", "rol": "Cliente" }
}
```
Credenciales incorrectas → `401 CREDENCIALES_INVALIDAS` (el mismo mensaje si el correo no existe). Usuario desactivado → `403 USUARIO_INACTIVO`. Al quinto fallo seguido con el mismo correo → `429 CUENTA_BLOQUEADA` con `Retry-After: 900`; el contador se reinicia al iniciar sesión correctamente. Si Redis no responde → `503 SERVICIO_NO_DISPONIBLE`.

### Refresh
```http
POST /api/auth/refresh
Cookie: refreshToken=…
```
```http
HTTP/1.1 200 OK
Set-Cookie: refreshToken=<nuevo>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth

{ "accessToken": "eyJhbGciOi…", "expiraEn": 900 }
```
Token vencido, revocado o reutilizado → `401 REFRESH_INVALIDO`. Si fue reutilizado, también se revoca toda la familia de tokens.

### Agregar al carrito
```http
POST /api/carrito/items
X-Cart-Token: 2b1f0c8e-6a3d-4f0e-9c1a-7d5e8b2f4a10

{ "idVariante": 41, "cantidad": 2 }
```
```json
{
  "idCarrito": 88,
  "tokenInvitado": "2b1f0c8e-6a3d-4f0e-9c1a-7d5e8b2f4a10",
  "items": [
    {
      "idVariante": 41, "sku": "CAM-BAS-M-AZ", "producto": "Camisa básica",
      "variante": "Talla M / Azul", "precioUnitario": "149.00", "cantidad": 2,
      "existenciaDisponible": 7, "subtotal": "298.00"
    }
  ],
  "cupon": null,
  "subtotal": "298.00",
  "descuento": "0.00",
  "total": "298.00"
}
```
Sin existencia suficiente:
```json
{
  "error": {
    "code": "STOCK_INSUFICIENTE",
    "message": "Solo hay 1 unidad disponible de CAM-BAS-M-AZ.",
    "details": [{ "field": "cantidad", "message": "Disponible: 1" }]
  },
  "requestId": "…"
}
```

### Aplicar cupón
```http
POST /api/carrito/cupon
Authorization: Bearer …

{ "codigo": "VERANO25" }
```
```json
{
  "error": {
    "code": "CUPON_MINIMO_NO_ALCANZADO",
    "message": "El cupón VERANO25 requiere una compra mínima de Q300.00; tu carrito suma Q298.00."
  },
  "requestId": "…"
}
```

### Iniciar checkout
```http
POST /api/checkout/iniciar
Authorization: Bearer …

{ "idDireccion": 5, "idMetodoEnvio": 1 }
```
```json
{
  "items": [ { "idVariante": 41, "cantidad": 2, "precioUnitario": "149.00", "descuentoLinea": "29.80", "subtotal": "268.20" } ],
  "cupon": { "codigo": "BIENVENIDA10", "tipo": "PORCENTAJE", "valor": "10.00" },
  "subtotal": "298.00",
  "descuento": "29.80",
  "costoEnvio": "25.00",
  "total": "293.20",
  "montoIVA": "31.41",
  "reservaExpiraEn": "2026-11-03T15:45:00Z"
}
```
El IVA (12 %) va incluido en el total; `montoIVA` es solo el desglose: `total - total / 1.12`.

### Pago idempotente
```http
POST /api/checkout/pagar
Authorization: Bearer …
Idempotency-Key: 9a7c1e52-4b8d-4f3a-a2e6-0c5d7b9f1e34

{ "metodoPago": "TARJETA", "datosPago": { "titular": "Ana López", "ultimos4": "4242" } }
```
```http
HTTP/1.1 201 Created
Location: /api/pedidos/1503

{ "idPedido": 1503, "numeroPedido": "SC-2026-001503", "estado": "PAGADO", "total": "293.20" }
```

| Situación | Respuesta |
| :--- | :--- |
| Primera vez con esa clave | `201` y el pedido nuevo |
| Misma clave repetida (doble clic, reintento por red) | `200` con el **mismo** pedido; no se crea otro pedido ni otro cobro |
| Misma clave con un carrito distinto | `409 IDEMPOTENCIA_CONFLICTO` |
| Falta el header | `400 IDEMPOTENCY_KEY_REQUERIDA` |
| La reserva venció | `409 RESERVA_VENCIDA`; el cliente debe iniciar el checkout de nuevo |
| El pago simulado se rechaza | `402 PAGO_RECHAZADO`; la reserva sigue vigente |

`Pedido.ClaveIdempotencia` es `UNIQUE`: aunque dos peticiones con la misma clave lleguen al mismo tiempo, solo una inserta y la otra lee el pedido existente.

`metodoPago` solo acepta `TARJETA`: el pago es simulado y la tabla `Pago` lo restringe con un `CHECK`. El esquema zod rechaza cualquier otro valor con 400 `VALIDACION` antes de llegar al SP.

### Cambiar estado de un pedido
```http
PATCH /api/pedidos/1503/estado
Authorization: Bearer …

{ "estado": "ENTREGADO", "comentario": "Entrega directa" }
```
```json
{
  "error": {
    "code": "TRANSICION_NO_PERMITIDA",
    "message": "Un pedido en estado PAGADO no puede pasar a ENTREGADO."
  },
  "requestId": "…"
}
```

### Registrar una devolución
```http
POST /api/pedidos/1503/devoluciones
Authorization: Bearer …

{
  "motivo": "Talla incorrecta",
  "lineas": [ { "idPedidoDetalle": 3021, "cantidad": 1 } ]
}
```
```http
HTTP/1.1 201 Created

{ "idDevolucion": 77, "tipo": "PARCIAL", "montoReembolso": "134.10", "estadoPedido": "DEVUELTO_PARCIAL" }
```

### Ajuste de inventario
```http
POST /api/inventario/ajustes
Authorization: Bearer …

{ "idVariante": 41, "tipo": "SALIDA", "cantidad": 3, "motivo": "Producto dañado en bodega" }
```
```http
HTTP/1.1 201 Created

{ "idMovimientoInventario": 9811, "existenciaAnterior": 9, "existenciaNueva": 6 }
```

---

## 4. Catálogo de códigos de error

Los SPs señalan errores de negocio con `THROW <número>, '<mensaje>', 1`. `sqlErrorMapper` traduce el número al código y al status HTTP. Los errores que no son de negocio (ej. violación de `UNIQUE`, 2627/2601) también se traducen; cualquier otro error devuelve 500 sin exponer detalles.

Una violación de FK o `CHECK` (547) no se traduce a propósito. Los SPs validan antes de escribir y responden con su código de negocio (por ejemplo, la dirección de otro cliente es 404 `NO_ENCONTRADO`), así que un 547 significa que un SP omitió una validación: responde 500 y queda en el log con el `requestId`. Las restricciones de la base son la última barrera (ver "Reglas de integridad en la base" en el README).

| Código | HTTP | THROW | Cuándo |
| :--- | :---: | :---: | :--- |
| `VALIDACION` | 400 | 50001 | Body, query o params no cumplen el esquema (zod) o una regla simple del SP |
| `IDEMPOTENCY_KEY_REQUERIDA` | 400 | — | Falta `Idempotency-Key` en el pago (middleware) |
| `NO_AUTENTICADO` | 401 | — | Falta el access token o no es válido |
| `TOKEN_EXPIRADO` | 401 | — | El access token venció; el frontend hace refresh y reintenta |
| `CREDENCIALES_INVALIDAS` | 401 | 50010 | Correo o contraseña incorrectos |
| `REFRESH_INVALIDO` | 401 | 50011 | Refresh token vencido, revocado o reutilizado |
| `PAGO_RECHAZADO` | 402 | 50020 | El pago simulado fue rechazado |
| `PROHIBIDO` | 403 | — | El rol no tiene acceso al recurso |
| `USUARIO_INACTIVO` | 403 | 50012 | El usuario está desactivado |
| `NO_ENCONTRADO` | 404 | 50004 | El recurso no existe o no pertenece al cliente |
| `DUPLICADO` | 409 | 2627 / 2601 | Correo, SKU, código de cupón o nombre de categoría repetido |
| `STOCK_INSUFICIENTE` | 409 | 50030 | La cantidad supera la existencia disponible |
| `RESERVA_VENCIDA` | 409 | 50031 | Se intenta pagar con una reserva vencida o inexistente |
| `TRANSICION_NO_PERMITIDA` | 409 | 50040 | Cambio de estado del pedido no definido en `TransicionEstadoPedido` |
| `IDEMPOTENCIA_CONFLICTO` | 409 | 50021 | Misma `Idempotency-Key` con un contenido distinto |
| `PRODUCTO_CON_VENTAS` | 409 | 50050 | Se intenta eliminar un producto con ventas |
| `EN_USO` | 409 | 50051 | Se intenta eliminar una categoría o cupón que está en uso, o un Admin intenta desactivarse a sí mismo |
| `CUPON_NO_EXISTE` | 422 | 50060 | El código no existe |
| `CUPON_INACTIVO` | 422 | 50061 | El cupón está desactivado |
| `CUPON_NO_VIGENTE` | 422 | 50062 | Aún no empieza su vigencia |
| `CUPON_VENCIDO` | 422 | 50063 | Ya terminó su vigencia |
| `CUPON_AGOTADO` | 422 | 50064 | Alcanzó su límite total de usos |
| `CUPON_LIMITE_CLIENTE` | 422 | 50065 | El cliente alcanzó su límite de usos |
| `CUPON_MINIMO_NO_ALCANZADO` | 422 | 50066 | El carrito no llega al monto mínimo |
| `CUPON_NO_APLICA` | 422 | 50067 | El carrito no tiene productos de la categoría del cupón |
| `EXISTENCIA_NEGATIVA` | 422 | 50032 | Un ajuste dejaría la existencia en negativo o por debajo de lo reservado |
| `CANTIDAD_DEVOLUCION_EXCEDIDA` | 422 | 50041 | Se devuelve más de lo vendido menos lo ya devuelto |
| `BITACORA_INMUTABLE` | 409 | 50070 | Intento de modificar o borrar la bitácora (trigger; no se expone por la API) |
| `KARDEX_INMUTABLE` | 409 | 50071 | Intento de modificar o borrar un movimiento de inventario (trigger; no se expone por la API) |
| `DEMASIADAS_SOLICITUDES` | 429 | — | Rate limiting por IP en autenticación (extra) |
| `CUENTA_BLOQUEADA` | 429 | — | Demasiados intentos fallidos de login con el mismo correo; incluye `Retry-After` |
| `SERVICIO_NO_DISPONIBLE` | 503 | — | Redis no responde: no se puede crear ni verificar la sesión |
| `ERROR_INTERNO` | 500 | — | Error no controlado; solo se registra en el log del servidor |

---

## 5. Extras opcionales

| Extra | Endpoint o mecanismo |
| :--- | :--- |
| Dashboard en tiempo real | `GET /api/reportes/stream` (Server-Sent Events, Admin). Emite un evento cuando se crea, cancela o devuelve un pedido |
| Exportación a Excel o PDF | Se genera en el frontend (`ReportTable`) con los datos de `/api/reportes/*`; no requiere endpoint nuevo |
| Caché de reportes | Caché en Redis por endpoint y filtros. Se invalida por versión (`INCR shopcart:reportes:version`) al crear, cancelar o cambiar de estado un pedido y al registrar una devolución, siempre después de confirmar la transacción. Las respuestas llevan `X-Cache: HIT` o `MISS` |
| Rate limiting | `POST /api/auth/login` y `POST /api/auth/registro`: 10 intentos por IP cada 15 minutos → `429 DEMASIADAS_SOLICITUDES`. Los contadores viven en Redis (`rate-limit-redis`) |

---

## 6. Procesos sin endpoint

| Proceso | Detalle |
| :--- | :--- |
| Liberación de reservas | `jobs/liberarReservas.job.ts` ejecuta `SP_Inventario_LiberarReservasVencidas` cada minuto. Además, `SP_Pedidos_CrearPedido` y `SP_Inventario_ReservarExistencia` ignoran las reservas vencidas aunque el job no haya corrido |
| Bitácora | Se escribe dentro de los SPs que crean, modifican o desactivan productos, precios, existencias, cupones y estados de pedido, en la misma transacción que el cambio |
| Historial de estados | Cada cambio de estado del pedido inserta en `HistorialEstadoPedido` dentro del mismo SP |

---

## 7. Decisiones tomadas

El enunciado deja estos puntos abiertos; se resolvieron así:

- **Pago simulado:** no hay pasarela real. `POST /api/checkout/pagar` acepta los datos de pago y los aprueba; para probar un rechazo se usa una tarjeta que termina en `0000`.
- **Cupones solo con sesión:** el límite de usos por cliente necesita saber quién es el cliente, así que un invitado no puede aplicar cupones.
- **Catálogo público separado del de gestión:** `/api/catalogo/*` solo muestra lo activo, con la existencia disponible; `/api/productos` y `/api/categorias` son para el Administrador e incluyen lo inactivo.
- **Precio en la variante:** el precio vive en `Variante`; cada cambio queda en la bitácora y el pedido guarda el precio del momento de la compra.
- **Cancelar libera el cupón:** al cancelar un pedido se resta su uso del cupón, para que el cliente pueda volver a usarlo.
- **Devoluciones solo sobre pedidos entregados**, registradas por Operador o Administrador.
