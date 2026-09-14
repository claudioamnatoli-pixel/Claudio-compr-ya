import { redirect } from 'next/navigation';
import { Campo, Formulario } from '@/components/formulario';
import { CONFIG, VERSION } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { destinoSiYaEntro, iniciarSesionAccion } from './acciones';
import { CuentasDemo } from './cuentas-demo';
import { PanelBaseVacia } from './panel-base-vacia';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar' };

export default async function LoginPage() {
  // Quien ya tiene sesión no necesita volver a entrar.
  const destino = await destinoSiYaEntro();
  if (destino) redirect(destino);

  // Si no hay ninguna cuenta, el formulario sólo puede responder «incorrectos»,
  // que no explica nada. Se detecta antes y se ofrece cargar los ejemplos.
  const cuentas = await prisma.empleado.count();
  const baseVacia = cuentas === 0;

  // Las cuentas de ejemplo se muestran para poder entrar sin adivinar. También
  // en producción: un despliegue recién sembrado no sirve de nada si no hay
  // forma de saber con qué entrar. Lo que no se muestra allí es la contraseña.
  const hayDemostracion =
    (await prisma.empleado.count({ where: { email: { endsWith: '@compr-ya.com.py' } } })) > 0;
  const enProduccion = process.env.NODE_ENV === 'production';

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
          <p className="mt-1 font-mono text-[11px] text-slate-400">versión {VERSION}</p>
        </div>

        {baseVacia ? <PanelBaseVacia /> : null}

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

        {hayDemostracion ? <CuentasDemo conPassword={!enProduccion} /> : null}
      </div>
    </div>
  );
}
