import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './services/http';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Reintenta solo errores de red o del servidor; un 4xx no cambia al reintentar.
      retry: (intentos, error) =>
        intentos < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});
