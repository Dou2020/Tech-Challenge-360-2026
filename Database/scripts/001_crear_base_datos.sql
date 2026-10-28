/*
    001_crear_base_datos.sql
    Elimina y vuelve a crear la base de datos.

    Variables de sqlcmd:
      $(DbName)  nombre de la base (ShopCart; las pruebas usan ShopCart_Test)
*/
USE master;
GO

IF DB_ID(N'$(DbName)') IS NOT NULL
BEGIN
    ALTER DATABASE [$(DbName)] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$(DbName)];
END;
GO

-- CI_AI: las búsquedas y los UNIQUE no distinguen mayúsculas ni tildes.
CREATE DATABASE [$(DbName)] COLLATE Modern_Spanish_100_CI_AI;
GO

-- Las lecturas no bloquean a las escrituras; las escrituras críticas usan UPDLOCK en los SPs.
ALTER DATABASE [$(DbName)] SET READ_COMMITTED_SNAPSHOT ON;
GO
