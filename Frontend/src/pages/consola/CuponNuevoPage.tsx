import { Link, useNavigate } from 'react-router';
import { Skeleton } from '../../components/atoms';
import { ErrorState, PageHeading } from '../../components/molecules';
import { CouponForm } from '../../components/organisms';
import { useCrearCupon, useTodasLasCategorias } from '../../hooks/queries';

/** Alta de un cupón. Nace activo y sin usos. */
export default function CuponNuevoPage() {
  const categorias = useTodasLasCategorias();
  const crear = useCrearCupon();
  const navigate = useNavigate();

  return (
    <>
      <PageHeading
        titulo="Nuevo cupón"
        descripcion="Las fechas se capturan en hora de Guatemala."
      />
      <Link
        to="/consola/cupones"
        className="-mt-4 mb-4 inline-block text-sm text-acento hover:underline"
      >
        ← Volver a cupones
      </Link>
      <div className="tarjeta p-5">
        {categorias.isPending && (
          <div role="status" aria-label="Cargando categorías">
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {categorias.isError && (
          <ErrorState error={categorias.error} onReintentar={() => void categorias.refetch()} />
        )}
        {categorias.data && (
          <CouponForm
            categorias={categorias.data}
            onCancelar={() => void navigate('/consola/cupones')}
            onGuardar={async (datos) => {
              const cupon = await crear.mutateAsync(datos);
              void navigate(`/consola/cupones/${cupon.idCupon}`, { state: { creado: true } });
            }}
          />
        )}
      </div>
    </>
  );
}
