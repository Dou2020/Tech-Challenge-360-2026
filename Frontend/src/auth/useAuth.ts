import { use } from 'react';
import { AuthContext, type ContextoAuth } from './authContext';

export function useAuth(): ContextoAuth {
  const contexto = use(AuthContext);
  if (!contexto) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return contexto;
}
