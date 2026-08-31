'use client';

import { useActionState } from 'react';
import type { ResultadoAccion } from '@/lib/acciones';
import { sembrarDatosDeEjemplo } from './sembrar';

/**
 * Aviso que aparece cuando la base no tiene ninguna cuenta.
 *
 * Sin esto, intentar entrar en una base vacía sólo devuelve «correo o
 * contraseña incorrectos», que manda a buscar el problema donde no está.
 */
export function PanelBaseVacia() {
  const [estado, cargar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    sembrarDatosDeEjemplo,
    null,
  );

  if (estado?.ok) {
    return (
      <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">{estado.mensaje}</p>
        <p className="mt-1">
          Entrá con <span className="font-mono">claudia@compr-ya.com.py</span> y la contraseña{' '}
          <span className="font-mono">demo1234</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Todavía no hay ninguna cuenta</p>
      <p className="mt-1">
        La base de datos está vacía, así que ningún usuario ni contraseña va a funcionar. Cargá
        los datos de ejemplo y vas a poder entrar.
      </p>
      <form action={cargar} className="mt-3">
        <button type="submit" disabled={pendiente} className="boton-primario">
          {pendiente ? 'Cargando… (tarda un momento)' : 'Cargar datos de ejemplo'}
        </button>
      </form>
      {estado && !estado.ok ? (
        <p role="alert" className="mt-3 break-words font-mono text-xs text-red-700">
          {estado.error}
        </p>
      ) : null}
    </div>
  );
}
