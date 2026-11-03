import { Spinner } from '../atoms/Spinner';

export function PantallaCarga() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-acento">
      <Spinner tamano="lg" />
    </div>
  );
}
