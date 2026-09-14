'use client';

/**
 * Las cuentas de ejemplo, para entrar de un toque.
 *
 * Antes se listaban como texto para copiar a mano, y un correo suelto en
 * pantalla se confunde con un enlace: al tocarlo el navegador intenta abrir el
 * correo o buscarlo, y parece que el sistema no anda. Acá cada cuenta es un
 * botón que rellena el formulario.
 *
 * En producción se muestran los correos —que ya figuran en el README— pero
 * **nunca la contraseña**: una base recién sembrada es pública, y escribir la
 * clave en la pantalla de acceso la regalaría a cualquiera que abra la
 * dirección.
 */
type Cuenta = { correo: string; papel: string };

const CUENTAS: Cuenta[] = [
  { correo: 'claudia@compr-ya.com.py', papel: 'administración' },
  { correo: 'lidia@compr-ya.com.py', papel: 'líder de equipo' },
  { correo: 'ana@compr-ya.com.py', papel: 'vendedora' },
  { correo: 'marco@compr-ya.com.py', papel: 'repartidor' },
  { correo: 'hugo@compr-ya.com.py', papel: 'almacén' },
];

export function CuentasDemo({ conPassword }: { conPassword: boolean }) {
  function rellenar(correo: string) {
    const email = document.querySelector<HTMLInputElement>('input[name="email"]');
    const password = document.querySelector<HTMLInputElement>('input[name="password"]');
    if (!email || !password) return;

    email.value = correo;
    if (conPassword) {
      password.value = 'demo1234';
      // Con los dos campos puestos, lo único que falta es confirmar.
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
    } else {
      password.focus();
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
      <p className="font-semibold">Cuentas de demostración</p>
      <p className="mt-1 text-amber-800">
        {conPassword
          ? 'Tocá una para entrar; se rellena sola. Cada rol ve cosas distintas.'
          : 'Tocá una para rellenar el correo. La contraseña es la que figura en el README.'}
      </p>
      <ul className="mt-2 space-y-1">
        {CUENTAS.map((cuenta) => (
          <li key={cuenta.correo}>
            <button
              type="button"
              onClick={() => rellenar(cuenta.correo)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-left transition hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
            >
              <span className="font-mono text-amber-900">{cuenta.correo}</span>
              <span className="shrink-0 text-amber-700">{cuenta.papel}</span>
            </button>
          </li>
        ))}
      </ul>
      {conPassword ? null : (
        <p className="mt-3 font-semibold text-amber-900">
          Cambiá esta contraseña apenas entres: mientras siga puesta, cualquiera que conozca la
          dirección puede entrar.
        </p>
      )}
    </div>
  );
}
