/*
    007_sp_auth.sql
    Stored procedures de autenticación, perfil y usuarios.

    Las sesiones (refresh tokens, revocación, bloqueo de login) viven en Redis: aquí solo se
    leen y escriben los datos del usuario. El hash de la contraseña (argon2id) lo calcula y lo
    verifica el backend; la base nunca recibe la contraseña en claro.

    Errores (ver Backend/API.md, catálogo de códigos):
      50001  VALIDACION
      50004  NO_ENCONTRADO
      2627   DUPLICADO (violación de UQ_Usuario_Correo; no tiene número de THROW propio)

    PENDIENTE: SP_Usuarios_ActualizarPerfil, SP_Usuarios_CambiarContrasena, SP_Usuarios_Listar,
               SP_Usuarios_Crear, SP_Usuarios_Actualizar, SP_Usuarios_CambiarEstado y SP_Direcciones_*.
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
    @HashContrasena NVARCHAR(255),
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

        IF @HashContrasena IS NULL OR LEN(@HashContrasena) = 0
            THROW 50001, N'La contraseña es obligatoria.', 1;

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
        VALUES (@IDRolCliente, @Correo, @HashContrasena, @Nombre, @Apellido, @Telefono, 1);

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
        u.Activo
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
        u.FechaCreacion
    FROM dbo.Usuario AS u
    INNER JOIN dbo.Rol AS r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuario;
END;
GO
