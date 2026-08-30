import { redirect } from 'next/navigation';
import { Campo, Formulario } from '@/components/formulario';
import { CONFIG } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { destinoSiYaEntro, iniciarSesionAccion } from './acciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar' };

export default async function LoginPage() {
  // Quien ya tiene sesión no necesita volver a entrar.
  const destino = await destinoSiYaEntro();
  if (destino) redirect(destino);

  // La base recién sembrada trae cuentas de ejemplo; se muestran para que quien
  // acaba de instalar el proyecto pueda entrar sin adivinar.
  const hayDemostracion =
    process.env.NODE_ENV !== 'production' &&
    (await prisma.empleado.count({ where: { email: { endsWith: '@compr-ya.com.py' } } })) > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-marca-600 text-lg font-bold text-white">
            CY
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
            {CONFIG.nombreTienda}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Entra con tu cuenta de trabajo</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Formulario accion={iniciarSesionAccion} textoBoton="Entrar" textoEnviando="Entrando…">
            <div className="space-y-4">
              <Campo etiqueta="Correo">
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  autoFocus
                  className="campo"
                  placeholder="nombre@compr-ya.com.py"
                />
              </Campo>
              <Campo etiqueta="Contraseña">
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="campo"
                />
              </Campo>
            </div>
          </Formulario>
        </div>

        {hayDemostracion ? (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <p className="font-semibold">Cuentas de demostración</p>
            <p className="mt-1 text-amber-800">
              Todas usan la contraseña <code className="font-mono font-semibold">demo1234</code>.
            </p>
            <ul className="mt-2 space-y-0.5 font-mono">
              <li>claudia@compr-ya.com.py — administración</li>
              <li>lidia@compr-ya.com.py — líder de equipo</li>
              <li>ana@compr-ya.com.py — vendedora</li>
              <li>marco@compr-ya.com.py — repartidor</li>
              <li>hugo@compr-ya.com.py — almacén</li>
            </ul>
            <p className="mt-2 text-amber-800">
              Cada rol ve cosas distintas: entra con varias para comprobarlo.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
