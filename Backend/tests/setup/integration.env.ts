// Se ejecuta en cada worker antes de los archivos de prueba: las variables deben existir
// antes de importar la app, porque src/config/env.ts las valida al cargarse.
import { inject } from 'vitest';

Object.assign(process.env, inject('testEnv'));
