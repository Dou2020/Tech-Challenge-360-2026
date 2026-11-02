/*
    007_sp_auth.sql
    Stored procedures de autenticación, perfil, usuarios y direcciones de entrega.

    Las sesiones (refresh tokens, revocación, bloqueo de login) viven en Redis: aquí solo se
    leen y escriben los datos del usuario. El hash de la contraseña (argon2id) lo calcula y lo
    verifica el backend; la base nunca recibe la contraseña en claro.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      50012  USUARIO_INACTIVO (SP_Usuarios_ValidarSolicitante)
      50051  EN_USO (administrador que se desactiva o se quita el rol, o el último administrador activo)
      2627   DUPLICADO (violación de UQ_Usuario_Correo; no tiene número de THROW propio)

    Sin objetos pendientes en este archivo.
    Ver Backend/API.md para la lista completa y el SP de cada endpoint.
*/
USE [$(DbName)];
GO
SET NOCOUNT ON;
GO

/* =========================================================
   Autenticación
   ========================================================= */

-- POST /api/auth/registro: crea un usuario con rol Cliente, activo.
-- El correo se guarda sin espacios y en minúsculas; la collation CI_AI ya hace que la
-- comparación y UQ_Usuario_Correo no distingan mayúsculas ni tildes.
--
-- Correo repetido: no se comprueba antes con IF EXISTS ni se lanza un THROW propio.
-- DUPLICADO no tiene número de THROW en el catálogo: sqlErrorMapper lo reconoce por el
-- error 2627/2601 de una UNIQUE. Una comprobación previa (aun con UPDLOCK, HOLDLOCK) solo
-- podría terminar en ese mismo INSERT fallido, así que no aporta nada. UQ_Usuario_Correo es
-- atómica: si dos registros con el mismo correo llegan a la vez, el segundo espera el bloqueo
-- de la llave del primero y recibe 2627 cuando este confirma. Es la vía normal y documentada
-- para DUPLICADO (Backend/API.md §4), no una validación omitida.
CREATE OR ALTER PROCEDURE dbo.SP_Auth_RegistrarCliente
    @Correo         NVARCHAR(150),
    @Nombre         NVARCHAR(100),
    @Apellido       NVARCHAR(100),
    @Telefono       NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDUsuario INT;
    DECLARE @IDRolCliente INT;

    SET @Correo   = LOWER(TRIM(@Correo));
    SET @Nombre   = TRIM(@Nombre);
    SET @Apellido = TRIM(@Apellido);
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar: las mismas reglas que CK_Usuario_Correo y los NOT NULL, con código de negocio.
        IF @Correo IS NULL OR @Correo NOT LIKE N'%_@_%._%'
            THROW 50001, N'El correo no tiene un formato válido.', 1;

        IF @Nombre IS NULL OR LEN(@Nombre) = 0
            THROW 50001, N'El nombre es obligatorio.', 1;

        IF @Apellido IS NULL OR LEN(@Apellido) = 0
            THROW 50001, N'El apellido es obligatorio.', 1;

        -- El rol se busca por nombre, nunca por ID fijo.
        SELECT @IDRolCliente = IDRol
        FROM dbo.Rol
        WHERE Nombre = N'Cliente';

        -- Sin el rol la instalación está incompleta: número fuera del catálogo, el backend responde 500.
        IF @IDRolCliente IS NULL
            THROW 50000, N'No existe el rol Cliente; ejecuta 085_datos_catalogos.sql.', 1;

        -- 2-3. Escribir. Un correo repetido termina aquí con 2627 (UQ_Usuario_Correo) → DUPLICADO.
        INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Telefono, Activo)
        --    HashContrasena queda NULL: el cliente crea su contraseña con el enlace enviado por correo.
        VALUES (@IDRolCliente, @Correo, NULL, @Nombre, @Apellido, @Telefono, 1);

        SET @IDUsuario = SCOPE_IDENTITY();

        -- 4. El registro de un cliente no va a la bitácora: el enunciado la exige para productos,
        --    precios, existencias, cupones y estados de pedido.

        COMMIT TRANSACTION;

        -- 5. Resultado
        SELECT
            u.IDUsuario,
            u.Correo,
            u.Nombre,
            u.Apellido,
            u.Telefono,
            r.Nombre AS Rol,
            u.Activo,
            u.FechaCreacion
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- POST /api/auth/login: datos para verificar la contraseña en el backend.
-- Devuelve 0 o 1 fila e incluye usuarios inactivos. No lanza errores: el backend responde
-- CREDENCIALES_INVALIDAS o USUARIO_INACTIVO sin revelar si el correo existe.
CREATE OR ALTER PROCEDURE dbo.SP_Auth_ObtenerUsuarioPorCorreo
    @Correo NVARCHAR(150)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.IDUsuario,
        u.Correo,
        u.HashContrasena,
        u.Nombre,
        u.Apellido,
        r.Nombre AS Rol,
        u.Activo,
        CONVERT(BIT, CASE WHEN u.HashContrasena IS NULL THEN 1 ELSE 0 END) AS ContrasenaPendiente
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.Correo = TRIM(@Correo);  -- CI_AI: no distingue mayúsculas ni tildes
END;
GO

/* =========================================================
   Usuarios
   ========================================================= */

-- GET /api/auth/me, POST /api/auth/refresh, GET /api/perfil y GET /api/usuarios/:id.
-- Nunca devuelve el hash de la contraseña. Incluye usuarios inactivos: el refresh necesita
-- saber que el usuario se desactivó para revocar la sesión.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ObtenerPorId
    @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Usuario WHERE IDUsuario = @IDUsuario)
        THROW 50004, N'El usuario no existe.', 1;

    SELECT
        u.IDUsuario,
        u.Correo,
        u.Nombre,
        u.Apellido,
        u.Telefono,
        r.Nombre AS Rol,
        u.Activo,
        u.FechaCreacion,
        CONVERT(BIT, CASE WHEN u.HashContrasena IS NULL THEN 1 ELSE 0 END) AS ContrasenaPendiente
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuario;
END;
GO

-- Uso interno de los SPs que escriben (no tiene endpoint). El solicitante sale del JWT, pero la
-- base no lo da por bueno: sin esta validación, un ID inexistente terminaría en un 547 de
-- FK_Bitacora_Usuario, y un usuario recién desactivado podría seguir escribiendo mientras su
-- access token no venza. Se llama dentro de la transacción del SP que escribe.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ValidarSolicitante
    @IDUsuarioSolicitante INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Activo BIT;

    SELECT @Activo = Activo
    FROM dbo.Usuario
    WHERE IDUsuario = @IDUsuarioSolicitante;

    IF @Activo IS NULL
        THROW 50004, N'El usuario solicitante no existe.', 1;

    IF @Activo = 0
        THROW 50012, N'El usuario solicitante está desactivado.', 1;
END;
GO

/* =========================================================
   Perfil y administración de usuarios
   ========================================================= */
-- Reglas de la administración de usuarios:
--   * Nadie, ni un Administrador, puede desactivarse a sí mismo ni quitarse el rol de
--     Administrador (50051 EN_USO: el backend lo responde 409).
--   * El sistema nunca se queda sin un Administrador activo: desactivar o cambiar de rol al
--     último (50051). Se bloquean (UPDLOCK) todos los administradores activos antes de contar,
--     así dos desactivaciones simultáneas no pueden dejar el sistema sin ninguno.
--   * La bitácora (Modulo 'Usuarios', Entidad 'Usuario') guarda la foto del usuario con
--     FU_Usuarios_UsuarioJson, que nunca incluye el hash de la contraseña.
-- Los SPs que modifican a otro usuario devuelven las columnas de SP_Usuarios_ObtenerPorId y dos
-- más, RolCambio y ActivoCambio (BIT), para que el backend sepa si debe revocar las sesiones
-- del usuario (cambió de rol o se desactivó) o invalidar su caché.

-- Uso de PUT /api/perfil/contrasena: el backend verifica la contraseña actual contra este hash.
-- Devuelve IDUsuario, HashContrasena (NULL si la contraseña está pendiente) y Activo (nunca va a la bitácora ni a una respuesta HTTP).
-- Usuario inexistente → 50004.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ObtenerCredencialPorId
    @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Usuario WHERE IDUsuario = @IDUsuario)
        THROW 50004, N'El usuario no existe.', 1;

    SELECT IDUsuario, HashContrasena, Activo
    FROM dbo.Usuario
    WHERE IDUsuario = @IDUsuario;
END;
GO

-- PUT /api/perfil: el usuario actualiza su nombre, apellido y teléfono (NULL o vacío lo borra).
-- El correo y el rol no se cambian aquí. No va a la bitácora (datos personales, no del negocio).
-- Resultado: SP_Usuarios_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_ActualizarPerfil
    @IDUsuarioSolicitante INT,
    @Nombre               NVARCHAR(100),
    @Apellido             NVARCHAR(100),
    @Telefono             NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Bloqueo INT;
    SET @Nombre   = NULLIF(TRIM(@Nombre), N'');
    SET @Apellido = NULLIF(TRIM(@Apellido), N'');
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @Nombre IS NULL
            THROW 50001, N'El nombre es obligatorio.', 1;

        IF @Apellido IS NULL
            THROW 50001, N'El apellido es obligatorio.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 2. Bloquear
        SELECT @Bloqueo = IDUsuario FROM dbo.Usuario WITH (UPDLOCK, ROWLOCK) WHERE IDUsuario = @IDUsuarioSolicitante;

        -- 3. Escribir
        UPDATE dbo.Usuario
        SET Nombre = @Nombre,
            Apellido = @Apellido,
            Telefono = @Telefono,
            FechaModificacion = SYSUTCDATETIME()
        WHERE IDUsuario = @IDUsuarioSolicitante;

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Usuarios_ObtenerPorId @IDUsuario = @IDUsuarioSolicitante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/perfil/contrasena y establecer contraseña por token (el solicitante es el dueño del token;
-- funciona también si el hash actual es NULL): guarda el hash nuevo (argon2id, calculado por el backend).
-- Deja en la bitácora que la contraseña cambió, sin ningún valor de la contraseña ni del hash.
-- Sin result set.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_CambiarContrasena
    @IDUsuarioSolicitante INT,
    @HashContrasena       NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Bloqueo INT;
    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @HashContrasena IS NULL OR LEN(TRIM(@HashContrasena)) = 0
            THROW 50001, N'La contraseña es obligatoria.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 2. Bloquear
        SELECT @Bloqueo = IDUsuario FROM dbo.Usuario WITH (UPDLOCK, ROWLOCK) WHERE IDUsuario = @IDUsuarioSolicitante;

        -- 3. Escribir
        UPDATE dbo.Usuario
        SET HashContrasena = @HashContrasena,
            FechaModificacion = SYSUTCDATETIME()
        WHERE IDUsuario = @IDUsuarioSolicitante;

        -- 4. Bitácora: solo el hecho, nunca el hash.
        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Usuarios', N'Usuario', @IDUsuarioSolicitante, N'MODIFICAR',
                NULL, N'{"ContrasenaCambiada":true}');

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- GET /api/usuarios: lista paginada (Admin). Mismas columnas que SP_Usuarios_ObtenerPorId.
--   @Texto   busca en "nombre apellido" y en el correo (literal, sin comodines)
--   @Rol     nombre del rol (Cliente, Operador, Administrador)
--   @Activo  1 o 0
--   @Orden   nombre | correo | rol | fechaCreacion, con :asc o :desc (por defecto nombre:asc)
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Listar
    @Texto        NVARCHAR(100) = NULL,
    @Rol          NVARCHAR(50)  = NULL,
    @Activo       BIT           = NULL,
    @Pagina       INT           = 1,
    @TamanoPagina INT           = 20,
    @Orden        NVARCHAR(50)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Patron NVARCHAR(400);
    DECLARE @Mensaje NVARCHAR(2048);

    SET @Rol   = NULLIF(TRIM(@Rol), N'');
    SET @Orden = ISNULL(NULLIF(TRIM(@Orden), N''), N'nombre:asc');

    IF @Pagina IS NULL OR @Pagina < 1
        THROW 50001, N'La página debe ser un número mayor o igual a 1.', 1;

    IF @TamanoPagina IS NULL OR @TamanoPagina NOT BETWEEN 1 AND 100
        THROW 50001, N'El tamaño de página debe estar entre 1 y 100.', 1;

    IF @Orden NOT IN (N'nombre:asc', N'nombre:desc', N'correo:asc', N'correo:desc',
                      N'rol:asc', N'rol:desc', N'fechaCreacion:asc', N'fechaCreacion:desc')
    BEGIN
        SET @Mensaje = CONCAT(N'Orden no permitido: ', @Orden,
                              N'. Usa nombre, correo, rol o fechaCreacion con :asc o :desc.');
        THROW 50001, @Mensaje, 1;
    END;

    SELECT @Patron = Patron FROM dbo.FU_Sistema_PatronBusqueda(@Texto);

    DECLARE @Fila TABLE (
        IDUsuario      INT           NOT NULL PRIMARY KEY,
        NombreCompleto NVARCHAR(201) NOT NULL,
        Correo         NVARCHAR(150) NOT NULL,
        Rol            NVARCHAR(50)  NOT NULL,
        FechaCreacion  DATETIME2(3)  NOT NULL
    );

    INSERT INTO @Fila (IDUsuario, NombreCompleto, Correo, Rol, FechaCreacion)
    SELECT u.IDUsuario, CONCAT(u.Nombre, N' ', u.Apellido), u.Correo, r.Nombre, u.FechaCreacion
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE (@Activo IS NULL OR u.Activo = @Activo)
      AND (@Rol IS NULL OR r.Nombre = @Rol)
      AND (@Patron IS NULL OR CONCAT(u.Nombre, N' ', u.Apellido) LIKE @Patron OR u.Correo LIKE @Patron)
    OPTION (RECOMPILE);

    SELECT
        u.IDUsuario,
        u.Correo,
        u.Nombre,
        u.Apellido,
        u.Telefono,
        f.Rol,
        u.Activo,
        u.FechaCreacion,
        CONVERT(BIT, CASE WHEN u.HashContrasena IS NULL THEN 1 ELSE 0 END) AS ContrasenaPendiente
    FROM @Fila AS f
    INNER JOIN dbo.Usuario AS u ON u.IDUsuario = f.IDUsuario
    ORDER BY
        CASE WHEN @Orden = N'nombre:asc'         THEN f.NombreCompleto END ASC,
        CASE WHEN @Orden = N'nombre:desc'        THEN f.NombreCompleto END DESC,
        CASE WHEN @Orden = N'correo:asc'         THEN f.Correo         END ASC,
        CASE WHEN @Orden = N'correo:desc'        THEN f.Correo         END DESC,
        CASE WHEN @Orden = N'rol:asc'            THEN f.Rol            END ASC,
        CASE WHEN @Orden = N'rol:desc'           THEN f.Rol            END DESC,
        CASE WHEN @Orden = N'fechaCreacion:asc'  THEN f.FechaCreacion  END ASC,
        CASE WHEN @Orden = N'fechaCreacion:desc' THEN f.FechaCreacion  END DESC,
        f.IDUsuario ASC
    OFFSET (CONVERT(BIGINT, @Pagina) - 1) * @TamanoPagina ROWS
    FETCH NEXT @TamanoPagina ROWS ONLY;

    SELECT COUNT(*) AS Total FROM @Fila;
END;
GO

-- POST /api/usuarios: crea un Operador o un Administrador activo (un Cliente se registra solo
-- con SP_Auth_RegistrarCliente). @Rol: 'Operador' o 'Administrador'; otro valor → 50001.
-- Un correo repetido termina en 2627 (UQ_Usuario_Correo) → DUPLICADO, igual que el registro.
-- Resultado: SP_Usuarios_ObtenerPorId del usuario creado.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Crear
    @IDUsuarioSolicitante INT,
    @Correo               NVARCHAR(150),
    @Nombre               NVARCHAR(100),
    @Apellido             NVARCHAR(100),
    @Telefono             NVARCHAR(20) = NULL,
    @Rol                  NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDUsuario INT;
    DECLARE @IDRol INT;
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Correo   = LOWER(TRIM(@Correo));
    SET @Nombre   = NULLIF(TRIM(@Nombre), N'');
    SET @Apellido = NULLIF(TRIM(@Apellido), N'');
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');
    SET @Rol      = NULLIF(TRIM(@Rol), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @Correo IS NULL OR @Correo NOT LIKE N'%_@_%._%'
            THROW 50001, N'El correo no tiene un formato válido.', 1;

        IF @Nombre IS NULL
            THROW 50001, N'El nombre es obligatorio.', 1;

        IF @Apellido IS NULL
            THROW 50001, N'El apellido es obligatorio.', 1;

        IF @Rol IS NULL OR @Rol NOT IN (N'Operador', N'Administrador')
            THROW 50001, N'El rol debe ser Operador o Administrador.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SELECT @IDRol = IDRol FROM dbo.Rol WHERE Nombre = @Rol;

        IF @IDRol IS NULL
            THROW 50001, N'El rol no existe.', 1;

        -- 3. Escribir (correo repetido: 2627)
        INSERT INTO dbo.Usuario (IDRol, Correo, HashContrasena, Nombre, Apellido, Telefono, Activo)
        --    HashContrasena queda NULL: el usuario crea su contraseña con el enlace enviado por correo.
        VALUES (@IDRol, @Correo, NULL, @Nombre, @Apellido, @Telefono, 1);

        SET @IDUsuario = SCOPE_IDENTITY();

        -- 4. Bitácora
        SELECT @Nuevo = Json FROM dbo.FU_Usuarios_UsuarioJson(@IDUsuario);

        INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
        VALUES (@IDUsuarioSolicitante, N'Usuarios', N'Usuario', @IDUsuario, N'CREAR', NULL, @Nuevo);

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Usuarios_ObtenerPorId @IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/usuarios/:id: actualiza nombre, apellido, teléfono (NULL o vacío lo borra) y rol.
-- @Rol NULL conserva el rol actual; el correo no se cambia. Cambiar el rol de un Cliente a
-- Operador o Administrador (y al revés) está permitido.
--   50004  el usuario no existe
--   50051  el solicitante intenta quitarse el rol de Administrador, o se quitaría el último
--          Administrador activo
-- Sin cambios reales no escribe ni registra bitácora. Si algo cambia, la bitácora es MODIFICAR
-- con la foto anterior y la nueva.
-- Resultado: columnas de SP_Usuarios_ObtenerPorId + RolCambio BIT + ActivoCambio BIT (siempre 0).
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_Actualizar
    @IDUsuarioSolicitante INT,
    @IDUsuario            INT,
    @Nombre               NVARCHAR(100),
    @Apellido             NVARCHAR(100),
    @Telefono             NVARCHAR(20) = NULL,
    @Rol                  NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Bloqueo INT;
    DECLARE @IDRolActual INT;
    DECLARE @IDRolNuevo INT;
    DECLARE @IDRolAdmin INT;
    DECLARE @ActivoActual BIT;
    DECLARE @RolCambio BIT = 0;
    DECLARE @Anterior NVARCHAR(MAX);
    DECLARE @Nuevo NVARCHAR(MAX);

    SET @Nombre   = NULLIF(TRIM(@Nombre), N'');
    SET @Apellido = NULLIF(TRIM(@Apellido), N'');
    SET @Telefono = NULLIF(TRIM(@Telefono), N'');
    SET @Rol      = NULLIF(TRIM(@Rol), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @Nombre IS NULL
            THROW 50001, N'El nombre es obligatorio.', 1;

        IF @Apellido IS NULL
            THROW 50001, N'El apellido es obligatorio.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SELECT @IDRolAdmin = IDRol FROM dbo.Rol WHERE Nombre = N'Administrador';

        -- 2. Bloquear a los administradores activos y al usuario
        SELECT @Bloqueo = IDUsuario FROM dbo.Usuario WITH (UPDLOCK, ROWLOCK)
        WHERE (IDRol = @IDRolAdmin AND Activo = 1) OR IDUsuario = @IDUsuario;

        SELECT @IDRolActual = IDRol, @ActivoActual = Activo
        FROM dbo.Usuario
        WHERE IDUsuario = @IDUsuario;

        IF @IDRolActual IS NULL
            THROW 50004, N'El usuario no existe.', 1;

        IF @Rol IS NULL
            SET @IDRolNuevo = @IDRolActual;
        ELSE
        BEGIN
            SELECT @IDRolNuevo = IDRol FROM dbo.Rol WHERE Nombre = @Rol;

            IF @IDRolNuevo IS NULL
                THROW 50001, N'El rol no existe.', 1;
        END;

        IF @IDRolActual = @IDRolAdmin AND @IDRolNuevo <> @IDRolAdmin AND @ActivoActual = 1
        BEGIN
            IF @IDUsuario = @IDUsuarioSolicitante
                THROW 50051, N'Un administrador no puede quitarse a sí mismo el rol de Administrador.', 1;

            IF NOT EXISTS (SELECT 1 FROM dbo.Usuario
                           WHERE IDRol = @IDRolAdmin AND Activo = 1 AND IDUsuario <> @IDUsuario)
                THROW 50051, N'No se puede quitar el rol al último administrador activo.', 1;
        END;

        SELECT @Anterior = Json FROM dbo.FU_Usuarios_UsuarioJson(@IDUsuario);

        -- 3. Escribir y 4. Bitácora (solo si algo cambia)
        IF EXISTS (SELECT 1 FROM dbo.Usuario
                   WHERE IDUsuario = @IDUsuario
                     AND (Nombre COLLATE Latin1_General_BIN2 <> @Nombre COLLATE Latin1_General_BIN2
                          OR Apellido COLLATE Latin1_General_BIN2 <> @Apellido COLLATE Latin1_General_BIN2
                          OR ISNULL(Telefono, N'') COLLATE Latin1_General_BIN2 <> ISNULL(@Telefono, N'') COLLATE Latin1_General_BIN2
                          OR IDRol <> @IDRolNuevo))
        BEGIN
            UPDATE dbo.Usuario
            SET Nombre = @Nombre,
                Apellido = @Apellido,
                Telefono = @Telefono,
                IDRol = @IDRolNuevo,
                FechaModificacion = SYSUTCDATETIME()
            WHERE IDUsuario = @IDUsuario;

            SET @RolCambio = CASE WHEN @IDRolNuevo <> @IDRolActual THEN 1 ELSE 0 END;

            SELECT @Nuevo = Json FROM dbo.FU_Usuarios_UsuarioJson(@IDUsuario);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Usuarios', N'Usuario', @IDUsuario, N'MODIFICAR', @Anterior, @Nuevo);
        END;

        COMMIT TRANSACTION;

        -- 5. Resultado
        SELECT
            u.IDUsuario,
            u.Correo,
            u.Nombre,
            u.Apellido,
            u.Telefono,
            r.Nombre AS Rol,
            u.Activo,
            u.FechaCreacion,
            CONVERT(BIT, CASE WHEN u.HashContrasena IS NULL THEN 1 ELSE 0 END) AS ContrasenaPendiente,
            @RolCambio AS RolCambio,
            CONVERT(BIT, 0) AS ActivoCambio
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PATCH /api/usuarios/:id/estado: activa o desactiva un usuario.
--   50004  el usuario no existe
--   50051  el solicitante intenta desactivarse a sí mismo, o se desactivaría al último
--          Administrador activo
-- Activar o desactivar a quien ya está en ese estado no escribe ni registra nada (ActivoCambio = 0).
-- Bitácora: ACTIVAR o DESACTIVAR con la foto anterior y la nueva.
-- Resultado: columnas de SP_Usuarios_ObtenerPorId + RolCambio BIT (siempre 0) + ActivoCambio BIT.
CREATE OR ALTER PROCEDURE dbo.SP_Usuarios_CambiarEstado
    @IDUsuarioSolicitante INT,
    @IDUsuario            INT,
    @Activo               BIT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Bloqueo INT;
    DECLARE @IDRolActual INT;
    DECLARE @IDRolAdmin INT;
    DECLARE @ActivoActual BIT;
    DECLARE @ActivoCambio BIT = 0;
    DECLARE @Anterior NVARCHAR(MAX);
    DECLARE @Nuevo NVARCHAR(MAX);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        IF @Activo IS NULL
            THROW 50001, N'El estado (activo) es obligatorio.', 1;

        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        SELECT @IDRolAdmin = IDRol FROM dbo.Rol WHERE Nombre = N'Administrador';

        -- 2. Bloquear a los administradores activos y al usuario
        SELECT @Bloqueo = IDUsuario FROM dbo.Usuario WITH (UPDLOCK, ROWLOCK)
        WHERE (IDRol = @IDRolAdmin AND Activo = 1) OR IDUsuario = @IDUsuario;

        SELECT @IDRolActual = IDRol, @ActivoActual = Activo
        FROM dbo.Usuario
        WHERE IDUsuario = @IDUsuario;

        IF @IDRolActual IS NULL
            THROW 50004, N'El usuario no existe.', 1;

        IF @Activo = 0 AND @ActivoActual = 1
        BEGIN
            IF @IDUsuario = @IDUsuarioSolicitante
                THROW 50051, N'No puedes desactivar tu propia cuenta.', 1;

            IF @IDRolActual = @IDRolAdmin
               AND NOT EXISTS (SELECT 1 FROM dbo.Usuario
                               WHERE IDRol = @IDRolAdmin AND Activo = 1 AND IDUsuario <> @IDUsuario)
                THROW 50051, N'No se puede desactivar al último administrador activo.', 1;
        END;

        -- 3. Escribir y 4. Bitácora (solo si el estado cambia)
        IF @ActivoActual <> @Activo
        BEGIN
            SELECT @Anterior = Json FROM dbo.FU_Usuarios_UsuarioJson(@IDUsuario);

            UPDATE dbo.Usuario
            SET Activo = @Activo,
                FechaModificacion = SYSUTCDATETIME()
            WHERE IDUsuario = @IDUsuario;

            SELECT @Nuevo = Json FROM dbo.FU_Usuarios_UsuarioJson(@IDUsuario);

            INSERT INTO dbo.Bitacora (IDUsuario, Modulo, Entidad, IDRegistro, Accion, ValorAnterior, ValorNuevo)
            VALUES (@IDUsuarioSolicitante, N'Usuarios', N'Usuario', @IDUsuario,
                    CASE WHEN @Activo = 1 THEN N'ACTIVAR' ELSE N'DESACTIVAR' END, @Anterior, @Nuevo);

            SET @ActivoCambio = 1;
        END;

        COMMIT TRANSACTION;

        -- 5. Resultado
        SELECT
            u.IDUsuario,
            u.Correo,
            u.Nombre,
            u.Apellido,
            u.Telefono,
            r.Nombre AS Rol,
            u.Activo,
            u.FechaCreacion,
            CONVERT(BIT, CASE WHEN u.HashContrasena IS NULL THEN 1 ELSE 0 END) AS ContrasenaPendiente,
            CONVERT(BIT, 0) AS RolCambio,
            @ActivoCambio AS ActivoCambio
        FROM dbo.Usuario AS u
        INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
        WHERE u.IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* =========================================================
   Direcciones
   ========================================================= */
-- Direcciones de entrega del cliente. Todas reciben @IDUsuarioSolicitante (sale del JWT) y solo
-- ven sus direcciones activas: la de otro usuario, la inexistente y la dada de baja responden
-- igual, 50004, sin revelar cuál de los tres casos es. La baja es lógica (Activo = 0) porque
-- Pedido apunta a la dirección (FK_Pedido_Direccion); el pedido conserva su copia en
-- DireccionEntrega, así que editar o dar de baja una dirección no altera pedidos ya hechos.
-- No van a la bitácora: el enunciado la exige para productos, precios, existencias, cupones y
-- estados de pedido.
-- Los textos se guardan sin espacios al inicio ni al final; los opcionales vacíos quedan en NULL.

-- Dirección activa del solicitante (GET /api/direcciones/:id si el backend la expone). También
-- es el resultado de SP_Direcciones_Crear y SP_Direcciones_Actualizar. Mismas columnas que
-- SP_Direcciones_ListarPorUsuario.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_ObtenerPorId
    @IDUsuarioSolicitante INT,
    @IDDireccion          INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Direccion
                   WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuarioSolicitante AND Activo = 1)
        THROW 50004, N'La dirección no existe.', 1;

    SELECT
        IDDireccion,
        Alias,
        NombreDestinatario,
        Telefono,
        Linea1,
        Linea2,
        Municipio,
        Departamento,
        CodigoPostal,
        Referencias
    FROM dbo.Direccion
    WHERE IDDireccion = @IDDireccion
      AND IDUsuario = @IDUsuarioSolicitante
      AND Activo = 1;
END;
GO

-- GET /api/direcciones: direcciones activas del solicitante, en el orden en que las creó.
-- Sin paginar: un cliente tiene pocas. Un usuario sin direcciones devuelve 0 filas.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_ListarPorUsuario
    @IDUsuarioSolicitante INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        IDDireccion,
        Alias,
        NombreDestinatario,
        Telefono,
        Linea1,
        Linea2,
        Municipio,
        Departamento,
        CodigoPostal,
        Referencias
    FROM dbo.Direccion
    WHERE IDUsuario = @IDUsuarioSolicitante
      AND Activo = 1
    ORDER BY IDDireccion;
END;
GO

-- POST /api/direcciones: crea una dirección activa del solicitante.
-- Obligatorios: alias, destinatario, teléfono, línea 1, municipio y departamento.
-- Resultado: SP_Direcciones_ObtenerPorId de la dirección creada.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Crear
    @IDUsuarioSolicitante INT,
    @Alias                NVARCHAR(50),
    @NombreDestinatario   NVARCHAR(150),
    @Telefono             NVARCHAR(20),
    @Linea1               NVARCHAR(200),
    @Linea2               NVARCHAR(200) = NULL,
    @Municipio            NVARCHAR(100),
    @Departamento         NVARCHAR(100),
    @CodigoPostal         NVARCHAR(10)  = NULL,
    @Referencias          NVARCHAR(300) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDDireccion INT;

    SET @Alias              = NULLIF(TRIM(@Alias), N'');
    SET @NombreDestinatario = NULLIF(TRIM(@NombreDestinatario), N'');
    SET @Telefono           = NULLIF(TRIM(@Telefono), N'');
    SET @Linea1             = NULLIF(TRIM(@Linea1), N'');
    SET @Linea2             = NULLIF(TRIM(@Linea2), N'');
    SET @Municipio          = NULLIF(TRIM(@Municipio), N'');
    SET @Departamento       = NULLIF(TRIM(@Departamento), N'');
    SET @CodigoPostal       = NULLIF(TRIM(@CodigoPostal), N'');
    SET @Referencias        = NULLIF(TRIM(@Referencias), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Alias IS NULL
            THROW 50001, N'El alias de la dirección es obligatorio.', 1;

        IF @NombreDestinatario IS NULL
            THROW 50001, N'El nombre del destinatario es obligatorio.', 1;

        IF @Telefono IS NULL
            THROW 50001, N'El teléfono es obligatorio.', 1;

        IF @Linea1 IS NULL
            THROW 50001, N'La dirección (línea 1) es obligatoria.', 1;

        IF @Municipio IS NULL
            THROW 50001, N'El municipio es obligatorio.', 1;

        IF @Departamento IS NULL
            THROW 50001, N'El departamento es obligatorio.', 1;

        -- 2-3. Escribir
        INSERT INTO dbo.Direccion (IDUsuario, Alias, NombreDestinatario, Telefono, Linea1, Linea2,
                                   Municipio, Departamento, CodigoPostal, Referencias, Activo)
        VALUES (@IDUsuarioSolicitante, @Alias, @NombreDestinatario, @Telefono, @Linea1, @Linea2,
                @Municipio, @Departamento, @CodigoPostal, @Referencias, 1);

        SET @IDDireccion = SCOPE_IDENTITY();

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Direcciones_ObtenerPorId @IDUsuarioSolicitante = @IDUsuarioSolicitante, @IDDireccion = @IDDireccion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- PUT /api/direcciones/:id: reemplaza todos los campos de una dirección activa del solicitante
-- (los opcionales en NULL se borran). Mismas reglas que SP_Direcciones_Crear.
-- Resultado: SP_Direcciones_ObtenerPorId.
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Actualizar
    @IDUsuarioSolicitante INT,
    @IDDireccion          INT,
    @Alias                NVARCHAR(50),
    @NombreDestinatario   NVARCHAR(150),
    @Telefono             NVARCHAR(20),
    @Linea1               NVARCHAR(200),
    @Linea2               NVARCHAR(200) = NULL,
    @Municipio            NVARCHAR(100),
    @Departamento         NVARCHAR(100),
    @CodigoPostal         NVARCHAR(10)  = NULL,
    @Referencias          NVARCHAR(300) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @Alias              = NULLIF(TRIM(@Alias), N'');
    SET @NombreDestinatario = NULLIF(TRIM(@NombreDestinatario), N'');
    SET @Telefono           = NULLIF(TRIM(@Telefono), N'');
    SET @Linea1             = NULLIF(TRIM(@Linea1), N'');
    SET @Linea2             = NULLIF(TRIM(@Linea2), N'');
    SET @Municipio          = NULLIF(TRIM(@Municipio), N'');
    SET @Departamento       = NULLIF(TRIM(@Departamento), N'');
    SET @CodigoPostal       = NULLIF(TRIM(@CodigoPostal), N'');
    SET @Referencias        = NULLIF(TRIM(@Referencias), N'');

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        IF @Alias IS NULL
            THROW 50001, N'El alias de la dirección es obligatorio.', 1;

        IF @NombreDestinatario IS NULL
            THROW 50001, N'El nombre del destinatario es obligatorio.', 1;

        IF @Telefono IS NULL
            THROW 50001, N'El teléfono es obligatorio.', 1;

        IF @Linea1 IS NULL
            THROW 50001, N'La dirección (línea 1) es obligatoria.', 1;

        IF @Municipio IS NULL
            THROW 50001, N'El municipio es obligatorio.', 1;

        IF @Departamento IS NULL
            THROW 50001, N'El departamento es obligatorio.', 1;

        -- 2. Bloquear la dirección; la de otro usuario o dada de baja no existe para el solicitante.
        IF NOT EXISTS (SELECT 1 FROM dbo.Direccion WITH (UPDLOCK, ROWLOCK)
                       WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuarioSolicitante AND Activo = 1)
            THROW 50004, N'La dirección no existe.', 1;

        -- 3. Escribir
        UPDATE dbo.Direccion
        SET Alias              = @Alias,
            NombreDestinatario = @NombreDestinatario,
            Telefono           = @Telefono,
            Linea1             = @Linea1,
            Linea2             = @Linea2,
            Municipio          = @Municipio,
            Departamento       = @Departamento,
            CodigoPostal       = @CodigoPostal,
            Referencias        = @Referencias
        WHERE IDDireccion = @IDDireccion
          AND IDUsuario = @IDUsuarioSolicitante;

        COMMIT TRANSACTION;

        -- 5. Resultado
        EXEC dbo.SP_Direcciones_ObtenerPorId @IDUsuarioSolicitante = @IDUsuarioSolicitante, @IDDireccion = @IDDireccion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- DELETE /api/direcciones/:id: baja lógica (Activo = 0). Deja de listarse y de poder usarse en el
-- checkout; los pedidos que la usaron conservan su copia. Una dirección ya dada de baja → 50004.
-- Sin result set (204).
CREATE OR ALTER PROCEDURE dbo.SP_Direcciones_Desactivar
    @IDUsuarioSolicitante INT,
    @IDDireccion          INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validar
        EXEC dbo.SP_Usuarios_ValidarSolicitante @IDUsuarioSolicitante;

        -- 2. Bloquear
        IF NOT EXISTS (SELECT 1 FROM dbo.Direccion WITH (UPDLOCK, ROWLOCK)
                       WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuarioSolicitante AND Activo = 1)
            THROW 50004, N'La dirección no existe.', 1;

        -- 3. Escribir
        UPDATE dbo.Direccion
        SET Activo = 0
        WHERE IDDireccion = @IDDireccion
          AND IDUsuario = @IDUsuarioSolicitante;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
