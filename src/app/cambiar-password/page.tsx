import Link from 'next/link';
import { Campo, Formulario } from '@/components/formulario';
import { requerirSesion } from '@/lib/guardias';
import { inicioDe } from '@/lib/permisos';
import { cambiarPassword } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cambiar contraseña' };

export default async function CambiarPasswordPage() {
  const usuario = await requerirSesion();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Cambiar contraseña
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {usuario.debeCambiarPassword
              ? 'Tu contraseña es provisional. Elige una propia para continuar.'
              : `Sesión de ${usuario.nombre}`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Formulario accion={cambiarPassword} textoBoton="Guardar contraseña">
            <div className="space-y-4">
              <Campo etiqueta="Contraseña actual">
                <input
                  name="actual"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="campo"
                />
              </Campo>
              <Campo
                etiqueta="Contraseña nueva"
                ayuda="Al menos 8 caracteres, combinando letras y números."
              >
                <input
                  name="nueva"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="campo"
                />
              </Campo>
              <Campo etiqueta="Repite la contraseña nueva">
                <input
                  name="repetida"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="campo"
                />
              </Campo>
            </div>
          </Formulario>
          <p className="mt-4 text-xs text-slate-500">
            Al cambiarla se cerrarán las demás sesiones abiertas con tu cuenta.
          </p>
        </div>

        {!usuario.debeCambiarPassword ? (
          <p className="mt-4 text-center text-sm">
            <Link href={inicioDe(usuario.rol)} className="text-marca-700 hover:underline">
              Volver
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
