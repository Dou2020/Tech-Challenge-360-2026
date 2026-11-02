/** Fila de SP_Configuracion_Listar y SP_Configuracion_Actualizar. */
export interface FilaConfiguracion {
  IDConfiguracion: number;
  Clave: string;
  Valor: string;
  Descripcion: string;
}

export interface Parametro {
  idConfiguracion: number;
  clave: string;
  /** Siempre texto, normalizado por el SP (`"15"`, `"12"`, `"12.50"`). */
  valor: string;
  descripcion: string;
}
