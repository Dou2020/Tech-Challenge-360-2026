/** Marcador animado mientras llegan los datos. El tamaño se da con clases (h-4 w-24…). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-borde ${className}`} />;
}
