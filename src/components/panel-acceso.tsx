'use client';

import { useActionState } from 'react';
import { otorgarAcceso, revocarAcceso } from '@/app/(panel)/equipo/acciones';
import type { ResultadoAccion } from '@/lib/acciones';
import { BotonAccion, Campo } from '@/components/formulario';

/**
 * Reparto de acceso al sistema.
 *
 * La contraseña provisional se muestra una sola vez, así que la pantalla se
 * queda en ese estado hasta que quien la reparte confirma que ya la anotó: si
 * la ficha se refrescara sola, el mensaje desaparecería y la contraseña se
 * perdería sin remedio, obligando a generar otra.
 */
export function PanelAcceso({
  empleadoId,
  nombre,
  email,
  tieneAcceso,
}: {
  empleadoId: string;
  nombre: string;
  email: string;
  tieneAcceso: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    otorgarAcceso,
    null,
  );

  const password = estado?.ok ? estado.datos?.password : undefined;

  if (password) {
    return (
      <div className="p-5">
        <p className="text-sm font-medium text-emerald-800">{estado?.ok ? estado.mensaje : null}</p>
        <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
          Contraseña provisional
        </p>
        <p className="mt-1 select-all rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 font-mono text-lg font-semibold tracking-wide text-emerald-900">
          {password}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Pásasela a {nombre.split(' ')[0]} junto con su correo{' '}
          <span className="font-mono text-slate-800">{email}</span>. Al entrar tendrá que
          cambiarla. <strong>No se vuelve a mostrar.</strong>
        </p>
        <button
          type="button"
          // Se recarga la página entera en lugar de refrescar el árbol: es la
          // única forma de garantizar que la ficha quede al día, y el precio de
          // una recarga en una acción tan puntual es irrelevante.
          onClick={() => window.location.reload()}
          className="boton-primario mt-4"
        >
          Ya la anoté
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-px bg-slate-200 md:grid-cols-2">
      <form action={enviar} className="bg-white p-5">
        <input type="hidden" name="empleadoId" value={empleadoId} />
        <Campo
          etiqueta="Contraseña provisional"
          ayuda="Déjalo vacío y se genera una fácil de dictar por teléfono."
        >
          <input
            name="password"
            type="text"
            autoComplete="off"
            className="campo"
            placeholder="Se genera sola"
          />
        </Campo>
        {estado && !estado.ok ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {estado.error}
          </p>
        ) : null}
        <button type="submit" disabled={pendiente} className="boton-primario mt-4">
          {pendiente
            ? 'Generando…'
            : tieneAcceso
              ? 'Restablecer contraseña'
              : 'Dar acceso'}
        </button>
      </form>

      <div className="bg-white p-5">
        {tieneAcceso ? (
          <>
            <p className="mb-3 text-sm text-slate-600">
              Quitar el acceso cierra sus sesiones abiertas al instante. La persona sigue en la
              nómina y conserva su historial.
            </p>
            <BotonAccion
              accion={revocarAcceso}
              camposOcultos={{ empleadoId }}
              variante="peligro"
              confirmacion={`${nombre} dejará de poder entrar al sistema. ¿Continuar?`}
            >
              Quitar el acceso
            </BotonAccion>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            Cuando le des acceso, aquí podrás quitárselo.
          </p>
        )}
      </div>
    </div>
  );
}
