'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';
import type { ResultadoAccion } from '@/lib/acciones';

type Accion = (
  estadoPrevio: ResultadoAccion | null,
  formData: FormData,
) => Promise<ResultadoAccion | null>;

/**
 * Envoltura de formulario que gestiona el estado del Server Action: deshabilita
 * el botón mientras se envía y muestra el error o la confirmación.
 */
export function Formulario({
  accion,
  children,
  textoBoton = 'Guardar',
  textoEnviando = 'Guardando…',
  variante = 'primario',
  className = '',
  extra,
}: {
  accion: Accion;
  children: ReactNode;
  textoBoton?: string;
  textoEnviando?: string;
  variante?: 'primario' | 'secundario' | 'peligro';
  className?: string;
  /** Contenido opcional que se coloca junto al botón de envío. */
  extra?: ReactNode;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const clasesBoton = {
    primario: 'boton-primario',
    secundario: 'boton-secundario',
    peligro: 'boton-peligro',
  }[variante];

  return (
    <form action={enviar} className={className}>
      {children}
      {estado && !estado.ok ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {estado.error}
        </p>
      ) : null}
      {estado?.ok && estado.mensaje ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {estado.mensaje}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendiente} className={clasesBoton}>
          {pendiente ? textoEnviando : textoBoton}
        </button>
        {extra}
      </div>
    </form>
  );
}

/**
 * Formulario de una sola acción sin campos visibles (cambiar un estado, marcar
 * una comisión como pagada…). Se muestra como un botón suelto.
 */
export function BotonAccion({
  accion,
  children,
  camposOcultos = {},
  variante = 'secundario',
  confirmacion,
  className = '',
}: {
  accion: Accion;
  children: ReactNode;
  camposOcultos?: Record<string, string>;
  variante?: 'primario' | 'secundario' | 'peligro';
  confirmacion?: string;
  className?: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const clasesBoton = {
    primario: 'boton-primario',
    secundario: 'boton-secundario',
    peligro: 'boton-peligro',
  }[variante];

  return (
    <form
      action={enviar}
      className={`inline-block ${className}`}
      onSubmit={(evento) => {
        if (confirmacion && !window.confirm(confirmacion)) evento.preventDefault();
      }}
    >
      {Object.entries(camposOcultos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
      <button type="submit" disabled={pendiente} className={clasesBoton}>
        {pendiente ? '…' : children}
      </button>
      {estado && !estado.ok ? (
        <span role="alert" className="ml-2 text-xs text-red-600">
          {estado.error}
        </span>
      ) : null}
    </form>
  );
}

/** Campo etiquetado, para no repetir el mismo marcado en cada formulario. */
export function Campo({
  etiqueta,
  children,
  ayuda,
  className = '',
}: {
  etiqueta: string;
  children: ReactNode;
  ayuda?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="etiqueta-campo">{etiqueta}</span>
      {children}
      {ayuda ? <span className="mt-1 block text-xs text-slate-500">{ayuda}</span> : null}
    </label>
  );
}
