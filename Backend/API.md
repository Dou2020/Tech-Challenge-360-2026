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
   - [Filtros de fecha](#filtros-de-fecha)
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
   - [Detalle público de un producto](#detalle-público-de-un-producto)
   - [Crear un producto](#crear-un-producto)
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
| Revocación | El access token lleva `jti` y `sid` (sesión). Solo se acepta mientras su sesión exista en Redis y no esté revocado. Tras logout, reutilización del refresh, desactivación, cambio de contraseña o de rol, deja de aceptarse de inmediato aunque no haya expirado |
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
Algunos endpoints de lectura se sirven desde Redis cuando es posible (*cache-aside*, *fail-open*: si Redis falla se lee de la base). Sus respuestas incluyen el header `X-Cache: HIT` (desde caché) o `X-Cache: MISS` (desde la base); los endpoints sin caché no lo envían.

| Endpoint | Clave | Vigencia | Se invalida al |
| :--- | :--- | :--- | :--- |
| `GET /api/catalogo/categorias` | `shopcart:catalogo:v{n}:categorias` | `CACHE_TTL_CATALOGO_SEG` (600 s) | Crear, actualizar, activar/desactivar o eliminar una categoría; crear, actualizar, activar/desactivar o eliminar un producto; crear o activar/desactivar una variante |
| `GET /api/metodos-envio` | `shopcart:catalogo:v{n}:metodos-envio` | `CACHE_TTL_CATALOGO_SEG` | Lo mismo (comparte el namespace `catalogo`) |
| `GET /api/auth/me` | `shopcart:usuario:{id}` | 15 min | Cambio de perfil, rol o estado del usuario |
| `GET /api/reportes/*` | `shopcart:reportes:v{n}:…` | `CACHE_TTL_REPORTES_SEG` | Ver [Extras](#5-extras-opcionales) |
| `GET /api/configuracion` | `shopcart:configuracion` | 1 h | `PUT /api/configuracion/:clave` |

La invalidación es `INCR shopcart:catalogo:version` y se hace en el servicio **después** de que el SP confirmó. Precios, SKU, valores de atributo e imágenes no aparecen en lo cacheado, así que cambiarlos no invalida.

La existencia disponible **nunca** se cachea. Por eso la búsqueda (`GET /api/catalogo/productos`, que trae `disponible`) y el detalle (`GET /api/catalogo/productos/:id`, que trae `existenciaDisponible`) se leen siempre de la base.

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

### Filtros de fecha
Los listados con `desde` y `hasta` aceptan dos formatos, y los dos extremos son inclusivos:

| Formato | Ejemplo | Se interpreta como |
| :--- | :--- | :--- |
| Día | `2026-11-01` | Día de Guatemala (UTC-6, sin horario de verano), igual que los reportes. En `desde` empieza a las 00:00:00.000 y en `hasta` cubre hasta las 23:59:59.999 hora local. Así `desde=2026-11-01&hasta=2026-11-01` trae todo el 1 de noviembre (de `2026-11-01T06:00:00.000Z` a `2026-11-02T05:59:59.999Z`) |
| Instante ISO 8601 con zona | `2026-11-01T15:30:00Z`, `2026-11-01T09:30:00-06:00` | Ese instante, tal cual |

Un instante sin zona (`2026-11-01T10:00:00`) se rechaza porque es ambiguo, y `desde` posterior a `hasta` también: los dos responden `400 VALIDACION`. Un valor vacío equivale a no filtrar.

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
| POST | `/api/auth/registro` | Público | Registra un Cliente (`correo`, `contrasena` de 8+ caracteres con al menos una letra y un número, `nombre`, `apellido`, `telefono` opcional). Devuelve 201 con los tokens, igual que el login. Correo repetido: 409 `DUPLICADO` | `SP_Auth_RegistrarCliente` |
| POST | `/api/auth/login` | Público | Valida credenciales; crea la sesión en Redis, devuelve el access token y deja la cookie de refresh. Un usuario inactivo recibe 403; tras 5 fallos, 429 `CUENTA_BLOQUEADA` | `SP_Auth_ObtenerUsuarioPorCorreo` + Redis |
| POST | `/api/auth/refresh` | Cookie | Rota el refresh token en Redis (script Lua atómico) y devuelve un access token nuevo con el rol y estado actuales del usuario. Si se reutiliza un token ya rotado, se revoca toda la sesión. Un usuario desactivado recibe 403 `USUARIO_INACTIVO` | Redis + `SP_Usuarios_ObtenerPorId` (con caché) |
| POST | `/api/auth/logout` | Cookie | Revoca el access token del header `Authorization` (si viene) y la sesión de la cookie, y borra la cookie. Los demás access tokens de esa sesión también dejan de aceptarse. Responde 204, también sin sesión | Redis |
| GET | `/api/auth/me` | Autenticado | Usuario de la sesión: `idUsuario`, `nombre`, `apellido`, `correo` y `rol` (mismo objeto que `usuario` del login). Usa la caché del usuario (`X-Cache`) | `SP_Usuarios_ObtenerPorId` |

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
Solo para el rol Cliente: Operador y Administrador reciben 403. El cliente sale siempre del token. Una dirección de otro cliente, inexistente o dada de baja responde igual, `404 NO_ENCONTRADO`. Una dirección se responde como `{ idDireccion, alias, nombreDestinatario, telefono, linea1, linea2, municipio, departamento, codigoPostal, referencias }`; los opcionales (`linea2`, `codigoPostal`, `referencias`) son `null` si no se dieron.

Body de POST y PUT: `alias` (máx. 50), `nombreDestinatario` (máx. 150), `telefono` (8 a 20 dígitos, espacios o guiones, con `+` opcional), `linea1` (máx. 200), `linea2` (opcional, máx. 200), `municipio` y `departamento` (máx. 100), `codigoPostal` (opcional, 5 dígitos) y `referencias` (opcional, máx. 300). Los textos se guardan sin espacios sobrantes y un opcional vacío se guarda como `null`.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/direcciones` | Cliente | Arreglo (sin paginar) de las direcciones activas del cliente, por `idDireccion` | `SP_Direcciones_ListarPorUsuario` |
| GET | `/api/direcciones/:id` | Cliente | Una dirección propia y activa. La usa el checkout para mostrar la dirección elegida | `SP_Direcciones_ObtenerPorId` |
| POST | `/api/direcciones` | Cliente | Crea una dirección. Responde 201 con la dirección y `Location: /api/direcciones/{id}` | `SP_Direcciones_Crear` |
| PUT | `/api/direcciones/:id` | Cliente | Reemplaza todos los campos de una dirección propia (omitir un opcional lo borra) | `SP_Direcciones_Actualizar` |
| DELETE | `/api/direcciones/:id` | Cliente | Baja lógica. Los pedidos conservan su copia de la dirección. Responde 204; repetirlo responde 404 | `SP_Direcciones_Desactivar` |

### Catálogo público — `/api/catalogo`
Solo muestra lo visible en la tienda: producto activo, de una categoría activa y con al menos una variante activa. Un producto que no cumple eso responde 404 `NO_ENCONTRADO`. Las listas sin paginar (categorías, métodos de envío) son arreglos JSON.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/catalogo/categorias` | Público | Categorías activas, por nombre: `idCategoria`, `nombre`, `descripcion`, `cantidadProductos` (productos visibles). Con caché (`X-Cache`) | `SP_Catalogo_ListarCategorias` |
| GET | `/api/catalogo/productos` | Público | Búsqueda paginada. Filtros: `q` (nombre, descripción, categoría o SKU; máx. 150), `idCategoria`, `precioMin`, `precioMax` (sobre el precio mínimo del producto; `precioMin > precioMax` → 400), `disponible` (`true` con existencia disponible, `false` agotados, sin el filtro todos). `sort`: `precio` (precio mínimo), `nombre`, `fechaCreacion`; default `fechaCreacion:desc`. Cada item: `idProducto`, `nombre`, `descripcion`, `idCategoria`, `categoria`, `precioMinimo`, `precioMaximo`, `disponible`, `imagenPrincipal`, `fechaCreacion`. Sin caché | `SP_Catalogo_BuscarProductos` |
| GET | `/api/catalogo/productos/:id` | Público | Detalle con `imagenes` (la principal primero) y `variantes` activas: `idVariante`, `sku`, `precio`, `existenciaDisponible`, `descripcion` ("Talla M / Color Negro") y `valores` (`idAtributo`, `atributo`, `idValorAtributo`, `valor`). Ver el [ejemplo](#detalle-público-de-un-producto). Sin caché | `SP_Catalogo_ObtenerProducto` |
| GET | `/api/metodos-envio` | Público | Métodos de envío activos, por costo: `idMetodoEnvio`, `nombre`, `costo`, `diasEstimados`. Con caché (`X-Cache`) | `SP_Checkout_ListarMetodosEnvio` |

### Categorías — `/api/categorias`
Una categoría se responde como `{ idCategoria, nombre, descripcion, activo, cantidadProductos, cantidadCupones }`.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/categorias` | Admin | Lista paginada, incluye inactivas. Filtros: `q` (nombre), `activo` (`true`/`false`). `sort`: `nombre`, `activo`, `cantidadProductos`; default `nombre:asc` | `SP_Categorias_Listar` |
| GET | `/api/categorias/:id` | Admin | Detalle | `SP_Categorias_ObtenerPorId` |
| POST | `/api/categorias` | Admin | Crea una categoría: `nombre` (único, máx. 100), `descripcion` (opcional, máx. 500). Responde 201. Nombre repetido: 409 `DUPLICADO` | `SP_Categorias_Crear` |
| PUT | `/api/categorias/:id` | Admin | Reemplaza nombre y descripción (omitir `descripcion` la borra) | `SP_Categorias_Actualizar` |
| PATCH | `/api/categorias/:id/estado` | Admin | `{ "activo": false }` activa o desactiva. Desactivarla oculta sus productos del catálogo público | `SP_Categorias_CambiarEstado` |
| DELETE | `/api/categorias/:id` | Admin | Elimina solo si no tiene productos (aunque estén inactivos) ni cupones; si los tiene, 409 `EN_USO`. Responde 204 | `SP_Categorias_Eliminar` |

### Productos — `/api/productos`
El detalle de gestión (`GET /:id` y las escrituras que no responden 204) es `{ idProducto, nombre, descripcion, idCategoria, categoria, categoriaActiva, activo, fechaCreacion, fechaModificacion, tieneVentas, puedeEliminarse, variantes, imagenes }`. Cada variante incluye las inactivas y trae `existenciaFisica`, `existenciaReservada` (solo reservas vigentes) y `existenciaDisponible`, además de los campos del catálogo público, `idProducto` y `activo`. `puedeEliminarse` es `true` solo si el producto no tiene ventas, kardex ni reservas.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/productos` | Admin | Lista paginada, incluye inactivos. Filtros: `q` (nombre o SKU), `idCategoria`, `activo`. `sort`: `nombre`, `categoria`, `precio`, `existencia`, `fechaCreacion`; default `fechaCreacion:desc`. Cada item: datos del producto, `cantidadVariantes`, `cantidadVariantesActivas`, `precioMinimo`/`precioMaximo` (null sin variantes), existencias física, reservada y disponible sumadas, `imagenPrincipal`, `fechaCreacion`, `fechaModificacion` | `SP_Productos_Listar` |
| GET | `/api/productos/:id` | Admin | Detalle con todas las variantes (existencia física, reservada y disponible) e imágenes | `SP_Productos_ObtenerPorId` |
| POST | `/api/productos` | Admin | Crea el producto con sus variantes en una sola transacción: `idCategoria`, `nombre` (máx. 150), `descripcion` (opcional) y `variantes` (1 a 50) con `sku` (máx. 50), `precio` (> 0), `existenciaInicial` (default 0) y `valores` (`idValorAtributo`, default `[]`). El backend arma `@Variantes` como JSON con las claves `sku`, `precio`, `existenciaInicial`, `valores` (el SP usa `OPENJSON`). La existencia inicial entra como movimiento de kardex `INVENTARIO_INICIAL`. Cada variante lleva como máximo un valor por atributo y no puede repetir la combinación de otra; si no: 400 `VALIDACION`. SKU repetido: 409 `DUPLICADO`. Categoría inexistente: 404. Responde 201 con el detalle. Ver el [ejemplo](#crear-un-producto) | `SP_Productos_Crear` |
| PUT | `/api/productos/:id` | Admin | Reemplaza nombre, descripción (omitirla la borra) y categoría | `SP_Productos_Actualizar` |
| PATCH | `/api/productos/:id/estado` | Admin | `{ "activo": false }` activa o desactiva; un producto inactivo deja de verse en la tienda | `SP_Productos_CambiarEstado` |
| DELETE | `/api/productos/:id` | Admin | Elimina solo un producto sin historia. Con ventas: 409 `PRODUCTO_CON_VENTAS` (se debe desactivar). Sin ventas pero con kardex o reservas (en la práctica, si alguna vez tuvo existencia): 409 `EN_USO`. Borra imágenes, variantes y líneas de carrito. Responde 204 | `SP_Productos_Eliminar` |
| POST | `/api/productos/:id/imagenes` | Admin | Agrega una imagen por URL: `url` (`http://` o `https://`, máx. 500), `orden` (0–255, default 0), `esPrincipal` (default `false`). Si el producto no tenía principal, la nueva lo es; con `esPrincipal: true` reemplaza a la anterior. Responde 201 con el detalle | `SP_Productos_AgregarImagen` |
| DELETE | `/api/productos/:id/imagenes/:idImagen` | Admin | Quita una imagen (404 si es de otro producto). Si era la principal, pasa a la siguiente por `orden`. Responde 204 | `SP_Productos_EliminarImagen` |
| POST | `/api/productos/:id/variantes` | Admin | Agrega una variante: `sku`, `precio`, `existenciaInicial` (default 0, entra al kardex), `valores` (`idValorAtributo`, como máximo uno por atributo y sin repetir la combinación de otra variante; si no: 400 `VALIDACION`). Responde 201 con la variante | `SP_Variantes_Crear` |

### Variantes — `/api/variantes`
La existencia **no** se modifica aquí: solo cambia por movimientos de inventario, pedidos, cancelaciones y devoluciones. Todas responden la variante con sus `valores` (misma forma que en el detalle de gestión del producto).

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| PUT | `/api/variantes/:id` | Admin | Actualiza `sku` y `valores`. Omitir `valores` conserva los actuales; `[]` los quita todos. Como máximo un valor por atributo y sin repetir la combinación de otra variante; si no: 400 `VALIDACION` | `SP_Variantes_Actualizar` |
| PATCH | `/api/variantes/:id/precio` | Admin | Cambia el precio (`{ "precio": "149.00" }`, > 0). Queda en la bitácora con el precio anterior y el nuevo; no altera pedidos ya realizados | `SP_Variantes_CambiarPrecio` |
| PATCH | `/api/variantes/:id/estado` | Admin | `{ "activo": false }` activa o desactiva la variante. Una variante inactiva no se muestra ni se vende | `SP_Variantes_CambiarEstado` |

### Atributos — `/api/atributos`
| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/atributos` | Admin | Arreglo de atributos con sus valores: `[{ idAtributo, nombre, cantidadValores, valores: [{ idValorAtributo, valor, cantidadVariantes }] }]` (Talla: S, M, L; Color: Negro, Azul) | `SP_Atributos_Listar` |
| POST | `/api/atributos` | Admin | Crea un atributo (`nombre`, único, máx. 50). Responde 201 con `{ idAtributo, nombre }` | `SP_Atributos_Crear` |
| POST | `/api/atributos/:id/valores` | Admin | Agrega un valor (`valor`, único dentro del atributo, máx. 50). Responde 201 con `{ idValorAtributo, idAtributo, atributo, valor }` | `SP_Atributos_AgregarValor` |

### Inventario — `/api/inventario`
La existencia física solo cambia por movimientos de kardex: entradas y ajustes de este módulo, más los que generan pedidos, cancelaciones y devoluciones. Nada de este módulo se cachea, porque todo trae existencias. Las entradas y los ajustes tampoco invalidan la caché del catálogo: lo cacheado no depende de la existencia.

- **Existencia** (item de `GET /existencias`): `{ idVariante, sku, idProducto, producto, idCategoria, categoria, descripcion, precio, existenciaFisica, existenciaReservada, existenciaDisponible, bajoStock, umbralBajoStock, activo, productoActivo, categoriaActiva }`. `existenciaReservada` cuenta solo las reservas vigentes, y `bajoStock` es `existenciaDisponible ≤ umbralBajoStock` (`Configuracion.UmbralBajoStock`, 5 por defecto). Incluye variantes, productos y categorías inactivos.
- **Movimiento** (item del kardex): `{ idMovimientoInventario, idVariante, fecha, codigoTipoMovimiento, nombreTipoMovimiento, signo, cantidad, existenciaAnterior, existenciaNueva, motivo, idUsuario, usuario, idPedido, numeroPedido, idDevolucion }`. `signo` es `1` (suma) o `-1` (resta), y siempre se cumple `existenciaNueva = existenciaAnterior + signo × cantidad`. `idPedido`, `numeroPedido` e `idDevolucion` son `null` en los movimientos manuales.
- **Movimiento registrado** (201 de entradas y ajustes): el movimiento más `sku`, `existenciaFisica`, `existenciaReservada` y `existenciaDisponible` de la variante después del movimiento.
- `idMovimientoInventario` es `BIGINT` en la base y en JSON es `number`: una identidad que avanza de uno en uno no llega a 2^53. Si llegara, el backend responde 500 en lugar de devolver un id redondeado.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/inventario/existencias` | Operador, Admin | Lista paginada por variante. Filtros: `q` (SKU o nombre del producto; máx. 150), `idCategoria`, `bajoStock` (`true`: disponible ≤ umbral; `false`: mayor; sin el filtro, todas), `activo` (estado de la variante). `sort`: `sku`, `producto`, `categoria`, `existenciaFisica`, `existenciaReservada`, `existenciaDisponible`; default `existenciaDisponible:asc` | `SP_Inventario_ListarExistencias` |
| GET | `/api/inventario/variantes/:idVariante/kardex` | Operador, Admin | Movimientos de la variante, paginados. Filtros: `desde` y `hasta` (ver [Filtros de fecha](#filtros-de-fecha)) y `tipo` (código del tipo, p. ej. `AJUSTE_SALIDA`, sin distinguir mayúsculas; uno inexistente → 400). `sort`: `fecha`; default `fecha:desc`. Variante inexistente: 404 | `SP_Inventario_ConsultarKardex` |
| POST | `/api/inventario/entradas` | Operador, Admin | Entrada por compra: `idVariante`, `cantidad` (entero de 1 a 1 000 000) y `motivo` (opcional, máx. 300; sin él queda `Entrada por compra`). Movimiento `ENTRADA_COMPRA`. Acepta variantes inactivas. Responde 201 con el movimiento registrado | `SP_Inventario_RegistrarEntrada` |
| POST | `/api/inventario/ajustes` | Operador, Admin | Ajuste manual: `idVariante`, `tipo` (`ENTRADA` o `SALIDA`), `cantidad` (entero de 1 a 1 000 000) y `motivo` (obligatorio, máx. 300; sin él, 400). Movimiento `AJUSTE_ENTRADA` o `AJUSTE_SALIDA`. Si una salida dejaría la existencia en negativo o por debajo de lo reservado vigente: 422 `EXISTENCIA_NEGATIVA`. Responde 201 con el movimiento registrado. Ver el [ejemplo](#ajuste-de-inventario) | `SP_Inventario_RegistrarAjuste` |
| GET | `/api/inventario/tipos-movimiento` | Operador, Admin | Arreglo de tipos para el filtro del kardex: `[{ idTipoMovimientoInventario, codigo, nombre, signo }]`, primero los que suman | `SP_Inventario_ListarTiposMovimiento` |

Entradas y ajustes escriben el kardex, actualizan `Variante.ExistenciaFisica` y dejan la bitácora (`Inventario`, `Variante`, `MODIFICAR`) en la misma transacción.

### Carrito — `/api/carrito`
Funciona para invitados (con `X-Cart-Token`) y para clientes (con su token). Todas las respuestas devuelven el carrito completo con los montos calculados por el backend; el frontend no recalcula nada. **El carrito nunca se cachea** (cambia con cada clic y trae existencia disponible).

Quién es el dueño: si la petición trae `Authorization`, manda el usuario del token y el `X-Cart-Token` se ignora; solo un **Cliente** tiene carrito (Operador y Administrador reciben 403 `PROHIBIDO`). Sin `Authorization`, el dueño es el invitado del `X-Cart-Token`. Un token de acceso inválido o vencido responde 401, nunca degrada a invitado. Un `X-Cart-Token` que no es UUID responde 400 `VALIDACION`. El `IDCarrito` nunca lo envía el cliente.

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/carrito` | Invitado, Cliente | Carrito actual: líneas, cupón, subtotal, descuento y total. Marca las líneas cuya cantidad ya supera lo disponible. Sin carrito: `idCarrito: null`, `items: []` y montos en `"0.00"` | `SP_Carrito_Obtener` |
| POST | `/api/carrito/items` | Invitado, Cliente | Agrega una variante (`idVariante`, `cantidad` entero 1–1000); si ya está, suma. Crea el carrito si no existe y al invitado le devuelve `tokenInvitado` (que debe enviar como `X-Cart-Token` en las siguientes). Variante o producto inactivo o inexistente: 404. Si el total supera lo disponible: 409 `STOCK_INSUFICIENTE` con la cifra en `details` | `SP_Carrito_AgregarItem` |
| PATCH | `/api/carrito/items/:idVariante` | Invitado, Cliente | Cambia la cantidad de una línea (`{ "cantidad": 3 }`, mismo control de existencia). Línea ausente: 404 | `SP_Carrito_ActualizarCantidad` |
| DELETE | `/api/carrito/items/:idVariante` | Invitado, Cliente | Quita una línea (aunque ya no se venda). Conserva el cupón. Línea ausente: 404 | `SP_Carrito_EliminarItem` |
| DELETE | `/api/carrito` | Invitado, Cliente | Vacía el carrito y quita el cupón | `SP_Carrito_Vaciar` |
| POST | `/api/carrito/cupon` | Cliente | Aplica un cupón (`{ "codigo": "BIENVENIDA10" }`, sin distinguir mayúsculas). Si no es válido, 422 con el código exacto del motivo (`CUPON_VENCIDO`, `CUPON_AGOTADO`, `CUPON_MINIMO_NO_ALCANZADO`…). Carrito vacío o inexistente: 400 `VALIDACION`. Reemplaza al cupón anterior: solo uno por pedido. Invitado: 401 | `SP_Carrito_AplicarCupon` |
| DELETE | `/api/carrito/cupon` | Cliente | Quita el cupón (sin cupón o sin carrito no es error). Invitado: 401 | `SP_Carrito_QuitarCupon` |
| POST | `/api/carrito/fusionar` | Cliente | Pasa el carrito de invitado al carrito del cliente. El token va en el body (`{ "tokenInvitado": "<uuid>" }`) o, si no viene, en el header `X-Cart-Token`; sin ninguno, 400. Suma cantidades recortadas a lo disponible (no falla por existencia) y conserva el cupón del cliente. Repetirla, o usar un token inexistente, ya fusionado o de un cliente, no cambia nada y no es error. Responde el carrito del cliente más `fusion` | `SP_Carrito_FusionarInvitado` |

**Forma del carrito** (todos los endpoints de arriba; montos como string decimal, fechas ISO 8601 UTC):

| Campo | Descripción |
| :--- | :--- |
| `idCarrito` | `number`, o `null` si todavía no hay carrito |
| `tokenInvitado` | Solo a invitados con carrito; un cliente nunca lo recibe |
| `items[]` | Por fecha de alta. Cada línea: `idCarritoDetalle`, `idVariante`, `sku`, `idProducto`, `producto`, `idCategoria`, `categoria`, `variante` (texto o `null`), `imagen` (o `null`), `precioUnitario` (vigente), `cantidad`, `importe` (precio × cantidad), `descuentoLinea`, `importeNeto`, `elegibleCupon`, `existenciaDisponible` (sin contar la reserva propia; 0 si no se vende), `vendible`, `excedeDisponible`, `requiereAjuste` (hay que bajar la cantidad o quitar la línea antes de pagar), `fechaAgregado` |
| `cupon` | `null`, o `{ idCupon, codigo, descripcion, tipoDescuento, valor, idCategoria, categoria, aplicado, codigoError, mensajeError }`. Si el cupón guardado ya no vale (vence, se agota, el carrito baja del mínimo…) la lectura no falla: `aplicado: false`, `codigoError` trae el código del catálogo (`CUPON_VENCIDO`…), `mensajeError` el texto y `descuento` es `"0.00"`. Sigue guardado hasta que el cliente lo quite |
| `cantidadLineas`, `cantidadUnidades` | Totales del carrito |
| `subtotal`, `descuento`, `total` | `total = subtotal − descuento` (el envío se agrega en el checkout) |
| `porcentajeIVA`, `montoIVA` | El IVA ya va incluido en el total; `montoIVA` es solo el desglose |
| `lineasRequierenAjuste` | Cuántas líneas tienen `requiereAjuste: true` |
| `fusion[]` | Solo en `POST /fusionar`, una fila por variante del invitado: `idVariante`, `sku`, `cantidadInvitado`, `cantidadAnterior`, `cantidadFinal`, `cantidadAgregada`, `recortada` |

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
Solo Administrador. Un cupón se responde como `{ idCupon, codigo, descripcion, tipoDescuento, valor, idCategoria, categoria, montoMinimo, fechaInicio, fechaFin, limiteUsosTotal, limiteUsosPorCliente, usosActuales, usosDisponibles, activo, vigente, agotado, cantidadPedidos, cantidadCarritos, puedeEliminarse }`. `vigente` solo mira las fechas (no `activo`). Los montos van como string y las fechas de entrada, como instante ISO 8601 **con zona** (`2026-11-01T00:00:00Z`; sin zona → 400).

| Método | Ruta | Acceso | Descripción | SP |
| :--- | :--- | :--- | :--- | :--- |
| GET | `/api/cupones` | Admin | Lista paginada. Filtros: `q` (código), `activo`, `vigente`. `sort`: `codigo`, `fechaInicio`, `fechaFin`, `usosActuales`, `valor`; default `codigo:asc` | `SP_Cupones_Listar` |
| GET | `/api/cupones/:id` | Admin | Detalle con usos actuales | `SP_Cupones_ObtenerPorId` |
| POST | `/api/cupones` | Admin | Crea un cupón (responde 201 con `Location`): `codigo` (máx. 30; letras, números, `-` y `_`; se guarda en mayúsculas; repetido → 409 `DUPLICADO`), `descripcion` (opcional), `tipoDescuento` (`PORCENTAJE`, hasta 100, o `MONTO_FIJO`), `valor` (> 0), `idCategoria` (opcional; sin ella aplica a todo el carrito; inexistente → 404), `montoMinimo` (default `"0"`), `fechaInicio`, `fechaFin` (posterior a la de inicio), `limiteUsosTotal` (≥ 1), `limiteUsosPorCliente` (default 1, no mayor que el total). Nace activo y sin usos | `SP_Cupones_Crear` |
| PUT | `/api/cupones/:id` | Admin | Reemplaza todo lo editable (omitir `descripcion`, `idCategoria` o `montoMinimo` los borra o reinicia); no cambia `activo` ni `usosActuales`. No permite bajar `limiteUsosTotal` por debajo de los usos actuales (400 `VALIDACION`) | `SP_Cupones_Actualizar` |
| PATCH | `/api/cupones/:id/estado` | Admin | Activa o desactiva (`{ "activo": false }`) | `SP_Cupones_CambiarEstado` |
| DELETE | `/api/cupones/:id` | Admin | Elimina solo si ningún pedido (aunque esté cancelado) ni carrito lo tiene; si no, 409 `EN_USO` y se debe desactivar. Responde 204 | `SP_Cupones_Eliminar` |
| GET | `/api/cupones/:id/usos` | Admin | Usos paginados (`sort`: `fecha`, `descuento`; default `fecha:desc`): `idUsoCupon`, `idPedido`, `numeroPedido`, `idUsuario`, `cliente`, `correo`, `descuento` (el de `Pedido.Descuento`), `totalPedido`, `estadoPedido`, `fecha`. Los pedidos cancelados ya no cuentan como uso | `SP_Cupones_ListarUsos` |

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
  "usuario": { "idUsuario": 12, "nombre": "Ana", "apellido": "López", "correo": "cliente@shopcart.gt", "rol": "Cliente" }
}
```
Credenciales incorrectas → `401 CREDENCIALES_INVALIDAS` (el mismo mensaje si el correo no existe; también se verifica contra un hash ficticio para que la respuesta tarde lo mismo). Usuario desactivado → `403 USUARIO_INACTIVO`, solo si la contraseña es correcta. Al quinto fallo seguido con el mismo correo → `429 CUENTA_BLOQUEADA` con `Retry-After: 900`, y así durante 15 minutos aunque llegue la contraseña correcta; el contador se reinicia al iniciar sesión correctamente. El correo se compara sin espacios ni mayúsculas. Si Redis no responde → `503 SERVICIO_NO_DISPONIBLE`.

`POST /api/auth/registro` responde igual, con `201 Created`.

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
Token vencido, revocado o reutilizado → `401 REFRESH_INVALIDO` y se borra la cookie. Si fue reutilizado, también se revoca toda la familia de tokens y sus access tokens. Dos refresh simultáneos con el mismo token cuentan como reutilización: uno recibe el token nuevo y el otro `401`, y la sesión queda revocada. Por eso el frontend comparte una sola renovación en curso. Usuario desactivado → `403 USUARIO_INACTIVO`.

Formato del refresh token: `<sid>.<secreto>`, donde `sid` es la sesión y el secreto son 32 bytes aleatorios en base64url. En Redis solo se guarda su SHA-256.

### Detalle público de un producto
```http
GET /api/catalogo/productos/5
```
```http
HTTP/1.1 200 OK

{
  "idProducto": 5,
  "nombre": "Tenis urbanos",
  "descripcion": "Tenis de lona con suela de goma.",
  "idCategoria": 3,
  "categoria": "Calzado",
  "precioMinimo": "459.00",
  "precioMaximo": "459.00",
  "disponible": true,
  "fechaCreacion": "2026-11-01T15:30:00.000Z",
  "imagenes": [
    { "idProductoImagen": 6, "url": "https://placehold.co/600x600?text=Tenis+urbanos", "orden": 0, "esPrincipal": true }
  ],
  "variantes": [
    {
      "idVariante": 11, "sku": "CAL-TEN-BLA-40", "precio": "459.00", "existenciaDisponible": 8,
      "descripcion": "Talla 40 / Color Blanco",
      "valores": [
        { "idAtributo": 1, "atributo": "Talla", "idValorAtributo": 8, "valor": "40" },
        { "idAtributo": 2, "atributo": "Color", "idValorAtributo": 13, "valor": "Blanco" }
      ]
    },
    {
      "idVariante": 12, "sku": "CAL-TEN-BLA-42", "precio": "459.00", "existenciaDisponible": 0,
      "descripcion": "Talla 42 / Color Blanco",
      "valores": [ … ]
    }
  ]
}
```
La variante inactiva `CAL-TEN-NEG-41` no aparece. `existenciaDisponible` es física menos reservas vigentes y se lee de la base en cada petición: esta respuesta no se cachea.

### Crear un producto
```http
POST /api/productos
Authorization: Bearer …

{
  "idCategoria": 1,
  "nombre": "Sudadero con capucha",
  "descripcion": "Algodón perchado",
  "variantes": [
    { "sku": "SUD-CAP-NEG-M", "precio": "249.00", "existenciaInicial": 10, "valores": [2, 12] },
    { "sku": "SUD-CAP-NEG-L", "precio": "249.00", "valores": [3, 12] }
  ]
}
```
```http
HTTP/1.1 201 Created

{
  "idProducto": 8, "nombre": "Sudadero con capucha", "descripcion": "Algodón perchado",
  "idCategoria": 1, "categoria": "Camisetas", "categoriaActiva": true, "activo": true,
  "fechaCreacion": "2026-11-01T15:30:00.000Z", "fechaModificacion": null,
  "tieneVentas": false, "puedeEliminarse": false,
  "variantes": [
    {
      "idVariante": 17, "idProducto": 8, "sku": "SUD-CAP-NEG-M", "precio": "249.00",
      "existenciaFisica": 10, "existenciaReservada": 0, "existenciaDisponible": 10,
      "activo": true, "descripcion": "Talla M / Color Negro", "valores": [ … ]
    },
    { "idVariante": 18, "sku": "SUD-CAP-NEG-L", "existenciaFisica": 0, … }
  ],
  "imagenes": []
}
```
El backend envía las variantes al SP como `@Variantes = N'[{"sku":"SUD-CAP-NEG-M","precio":"249.00","existenciaInicial":10,"valores":[2,12]},…]'`. La primera variante genera un movimiento `INVENTARIO_INICIAL` de 10 unidades; por eso `puedeEliminarse` ya es `false`. Con `"valores": [2, 3]` (dos tallas) la respuesta es `400 VALIDACION`, y con un SKU que ya existe, `409 DUPLICADO`.

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
      "idCarritoDetalle": 120, "idVariante": 41, "sku": "CAM-BAS-M-AZ",
      "idProducto": 9, "producto": "Camisa básica", "idCategoria": 2, "categoria": "Camisetas",
      "variante": "Talla M / Azul", "imagen": null,
      "precioUnitario": "149.00", "cantidad": 2, "importe": "298.00",
      "descuentoLinea": "0.00", "importeNeto": "298.00", "elegibleCupon": true,
      "existenciaDisponible": 7, "vendible": true, "excedeDisponible": false,
      "requiereAjuste": false, "fechaAgregado": "2026-11-01T15:30:00.000Z"
    }
  ],
  "cupon": null,
  "cantidadLineas": 1,
  "cantidadUnidades": 2,
  "subtotal": "298.00",
  "descuento": "0.00",
  "total": "298.00",
  "porcentajeIVA": "12.00",
  "montoIVA": "31.93",
  "lineasRequierenAjuste": 0
}
```
Sin existencia suficiente (el SP solo trae la cifra dentro del mensaje; el backend la copia a `details`):
```json
{
  "error": {
    "code": "STOCK_INSUFICIENTE",
    "message": "Solo hay 1 unidad(es) disponible(s) de CAM-BAS-M-AZ.",
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
Con un cupón válido (`BIENVENIDA10`, 10 %) responde el carrito completo con el descuento ya repartido por línea:
```json
{
  "idCarrito": 88,
  "items": [ { "idVariante": 1, "cantidad": 2, "importe": "178.00", "descuentoLinea": "17.80", "importeNeto": "160.20", "…": "…" } ],
  "cupon": { "idCupon": 1, "codigo": "BIENVENIDA10", "tipoDescuento": "PORCENTAJE", "valor": "10.00", "aplicado": true, "codigoError": null, "mensajeError": null, "…": "…" },
  "subtotal": "178.00",
  "descuento": "17.80",
  "total": "160.20",
  "…": "…"
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

{
  "idMovimientoInventario": 9811, "idVariante": 41, "fecha": "2026-11-03T15:30:00.000Z",
  "codigoTipoMovimiento": "AJUSTE_SALIDA", "nombreTipoMovimiento": "Ajuste de salida", "signo": -1,
  "cantidad": 3, "existenciaAnterior": 9, "existenciaNueva": 6,
  "motivo": "Producto dañado en bodega", "idUsuario": 2, "usuario": "Óscar Operador",
  "idPedido": null, "numeroPedido": null, "idDevolucion": null,
  "sku": "CAM-BAS-M-AZ", "existenciaFisica": 6, "existenciaReservada": 2, "existenciaDisponible": 4
}
```
Antes del ajuste la variante tenía 9 unidades físicas y 2 reservadas vigentes. Con `"cantidad": 10` la existencia quedaría en `-1`, y con `"cantidad": 8` quedaría en 1, por debajo de las 2 reservadas: los dos responden `422 EXISTENCIA_NEGATIVA` y no se escribe nada. Sin `motivo`: `400 VALIDACION`.

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
| `USUARIO_INACTIVO` | 403 | 50012 | El usuario está desactivado. Además del login y el refresh, puede salir de cualquier SP que escribe (`@IDUsuarioSolicitante` desactivado) |
| `NO_ENCONTRADO` | 404 | 50004 | El recurso no existe o no pertenece al cliente |
| `DUPLICADO` | 409 | 2627 / 2601 | Correo, SKU, código de cupón o nombre de categoría repetido |
| `STOCK_INSUFICIENTE` | 409 | 50030 | La cantidad supera la existencia disponible |
| `RESERVA_VENCIDA` | 409 | 50031 | Se intenta pagar con una reserva vencida o inexistente |
| `TRANSICION_NO_PERMITIDA` | 409 | 50040 | Cambio de estado del pedido no definido en `TransicionEstadoPedido` |
| `IDEMPOTENCIA_CONFLICTO` | 409 | 50021 | Misma `Idempotency-Key` con un contenido distinto |
| `PRODUCTO_CON_VENTAS` | 409 | 50050 | Se intenta eliminar un producto con ventas (se debe desactivar) |
| `EN_USO` | 409 | 50051 | Se intenta eliminar una categoría con productos o cupones, un cupón en uso o un producto sin ventas pero con kardex o reservas (si alguna vez tuvo existencia), o un Admin intenta desactivarse a sí mismo |
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
| Rate limiting | `POST /api/auth/login` y `POST /api/auth/registro`: 10 intentos por IP cada 15 minutos, con un contador por endpoint → `429 DEMASIADAS_SOLICITUDES` con `Retry-After` y headers `RateLimit-*`. Los contadores viven en Redis (`rate-limit-redis`, claves `shopcart:ratelimit:{login\|registro}:{ip}`). Se configura con `RATE_LIMIT_AUTH_MAX` (0 lo desactiva) y `RATE_LIMIT_AUTH_VENTANA_MIN`. Si Redis no responde, el limitador deja pasar la solicitud: no abre un hueco, porque login y registro responden `503` por su cuenta (fail-closed) |

---

## 6. Procesos sin endpoint

| Proceso | Detalle |
| :--- | :--- |
| Liberación de reservas | `jobs/liberarReservas.job.ts` ejecuta `SP_Inventario_LiberarReservasVencidas` cada `RESERVAS_JOB_INTERVAL_MS` (60 000 ms, un minuto). El SP marca `LIBERADA` cada reserva activa vencida y resta su cantidad de `Variante.ExistenciaReservada` en una transacción. Si la pasada anterior sigue en curso, la nueva se omite. Un error queda en el log y no detiene el proceso, y solo se registra en `info` cuando liberó algo. Lo arranca `server.ts` (no `createApp()`) y el cierre ordenado lo detiene y espera su pasada antes de cerrar el pool. Además, `SP_Pedidos_CrearPedido` y `SP_Inventario_ReservarExistencia` ignoran las reservas vencidas aunque el job no haya corrido |
| Bitácora | Se escribe dentro de los SPs que crean, modifican o desactivan productos, precios, existencias, cupones y estados de pedido, en la misma transacción que el cambio |
| Historial de estados | Cada cambio de estado del pedido inserta en `HistorialEstadoPedido` dentro del mismo SP |

---

## 7. Decisiones tomadas

El enunciado deja estos puntos abiertos; se resolvieron así:

- **Pago simulado:** no hay pasarela real. `POST /api/checkout/pagar` acepta los datos de pago y los aprueba; para probar un rechazo se usa una tarjeta que termina en `0000`.
- **Carrito solo de Clientes (con sesión):** un Operador o Administrador con token recibe 403 `PROHIBIDO` en `/api/carrito`; el invitado usa `X-Cart-Token`. Si hay token de acceso y también `X-Cart-Token`, manda el usuario. El carrito no se cachea.
- **Fusión:** `POST /api/carrito/fusionar` toma `tokenInvitado` del body o, si falta, de `X-Cart-Token`. El carrito del invitado queda `FUSIONADO` y repetirla no duplica nada.
- **Cupón que deja de valer:** la lectura del carrito no falla; trae `cupon.aplicado: false` con `codigoError` y `mensajeError`, y `descuento` en `"0.00"`. El checkout lo vuelve a validar.
- **Cupones solo con sesión:** el límite de usos por cliente necesita saber quién es el cliente, así que un invitado no puede aplicar cupones.
- **Catálogo público separado del de gestión:** `/api/catalogo/*` solo muestra lo activo, con la existencia disponible; `/api/productos` y `/api/categorias` son para el Administrador e incluyen lo inactivo.
- **Precio en la variante:** el precio vive en `Variante`; cada cambio queda en la bitácora y el pedido guarda el precio del momento de la compra.
- **Cancelar libera el cupón:** al cancelar un pedido se resta su uso del cupón, para que el cliente pueda volver a usarlo.
- **Devoluciones solo sobre pedidos entregados**, registradas por Operador o Administrador.
- **Fechas sin hora son días de Guatemala:** en `desde`/`hasta`, `2026-11-01` cubre el día local completo, como en los reportes; un instante con zona se usa tal cual ([Filtros de fecha](#filtros-de-fecha)).
- **Ids `BIGINT` como `number`:** el kardex usa `BIGINT`; en JSON va como número porque no llegará a 2^53.
