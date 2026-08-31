'use client';

import { useEffect } from 'react';

/**
 * Pantalla de error.
 *
 * Muestra el motivo real cuando el servidor lo entrega, en lugar de adivinar la
 * causa: una pista equivocada hace perder más tiempo que no dar ninguna. En
 * producción Next oculta el mensaje y deja sólo un código, que es el que hay que
 * buscar en los registros del servidor.
 */
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
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-red-600">Algo falló</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">No se pudo cargar la página</h1>

      {error.message ? (
        <p className="mt-4 break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left font-mono text-sm text-red-800">
          {error.message}
        </p>
      ) : null}

      {error.digest ? (
        <p className="mt-3 text-xs text-slate-500">
          Código del error: <code className="font-mono">{error.digest}</code>. El detalle está en
          los registros del servidor, en la terminal donde arrancaste el programa.
        </p>
      ) : null}

      <p className="mt-4 text-sm text-slate-600">
        Si el problema sigue, volvé a preparar el proyecto con{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">npm run preparar</code>.
      </p>

      <button type="button" onClick={reset} className="boton-primario mt-6">
        Reintentar
      </button>
    </div>
  );
}
