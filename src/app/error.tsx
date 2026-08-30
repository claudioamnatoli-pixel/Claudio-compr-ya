'use client';

import { useEffect } from 'react';

export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-red-600">Algo falló</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">No se pudo cargar la página</h1>
      <p className="mt-2 text-sm text-slate-600">
        Vuelve a intentarlo. Si el problema sigue, revisa que la base de datos esté creada con{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">npm run db:reset</code>.
      </p>
      <button type="button" onClick={reset} className="boton-primario mt-6">
        Reintentar
      </button>
    </div>
  );
}
