import { Link, useLocation, useParams } from 'react-router';
import { PageHeading } from '../../components/molecules';
import { KardexTable } from '../../components/organisms';
import NoEncontradoPage from '../errores/NoEncontradoPage';

/** Kardex de una variante; el SKU llega por el estado del enlace cuando se viene del inventario. */
export default function KardexPage() {
  const { idVariante } = useParams();
  const id = Number(idVariante);
  const { state } = useLocation() as { state: { sku?: string; producto?: string } | null };
  if (!Number.isInteger(id) || id < 1) return <NoEncontradoPage />;

  return (
    <>
      <PageHeading
        titulo={state?.sku ? `Kardex de ${state.sku}` : `Kardex de la variante ${id}`}
        descripcion={state?.producto ?? 'Movimientos de inventario de la variante.'}
      />
      <Link
        to="/consola/inventario"
        className="-mt-4 mb-4 inline-block text-sm text-acento hover:underline"
      >
        ← Volver al inventario
      </Link>
      <KardexTable idVariante={id} />
    </>
  );
}
