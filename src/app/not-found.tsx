import Link from 'next/link';

export const metadata = { title: 'Página no encontrada' };

export default function NoEncontrado() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-marca-600">Error 404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Aquí no hay nada</h1>
      <p className="mt-2 text-sm text-slate-600">
        El registro que buscas no existe o se eliminó.
      </p>
      <Link href="/" className="boton-primario mt-6">
        Volver al panel
      </Link>
    </div>
  );
}
