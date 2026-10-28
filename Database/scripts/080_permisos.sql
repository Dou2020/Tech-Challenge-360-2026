/*
    080_permisos.sql
    Login de la aplicación con permiso EXECUTE únicamente.
    El backend solo puede ejecutar stored procedures: cualquier SELECT/INSERT/UPDATE/DELETE
    directo sobre las tablas es rechazado por la base. Las vistas y funciones se usan desde
    los SPs por encadenamiento de propiedad (mismo dueño dbo).

    Variables de sqlcmd:
      $(DbName)       nombre de la base
      $(AppLogin)     login de la aplicación (shopcart_app)
      $(AppPassword)  contraseña del login
*/
USE master;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(AppLogin)')
    CREATE LOGIN [$(AppLogin)] WITH PASSWORD = N'$(AppPassword)', CHECK_POLICY = ON, DEFAULT_DATABASE = [$(DbName)];
ELSE
    ALTER LOGIN [$(AppLogin)] WITH PASSWORD = N'$(AppPassword)', DEFAULT_DATABASE = [$(DbName)];
GO

USE [$(DbName)];
GO

CREATE USER [$(AppLogin)] FOR LOGIN [$(AppLogin)] WITH DEFAULT_SCHEMA = dbo;
GO

GRANT EXECUTE ON SCHEMA::dbo TO [$(AppLogin)];
GO

-- Explícito, aunque el usuario no tiene permisos de tabla: la bitácora y el kardex son inmutables.
DENY UPDATE, DELETE ON dbo.Bitacora TO [$(AppLogin)];
DENY UPDATE, DELETE ON dbo.MovimientoInventario TO [$(AppLogin)];
GO
