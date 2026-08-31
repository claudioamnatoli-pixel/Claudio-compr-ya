import { NextResponse, type NextRequest } from 'next/server';

/** Dominios de proxy en los que confiamos para reescribir el host reenviado. */
const PROXIES_CONFIABLES = [/\.app\.github\.dev$/, /\.github\.dev$/];

function esProxyConfiable(host: string): boolean {
  return PROXIES_CONFIABLES.some((patron) => patron.test(host));
}

/**
 * Prepara cada petición antes de que la vea la aplicación.
 *
 * 1. Anota la ruta pedida, para que el layout del panel pueda comprobar el
 *    permiso antes de empezar a dibujar.
 * 2. Alinea el host reenviado con el origen cuando la petición llega desde un
 *    proxy de GitHub. Next rechaza un Server Action si esos dos valores no
 *    coinciden —así impide que otro sitio dispare acciones en tu nombre—, y
 *    detrás del reenvío de puertos de Codespaces no coinciden nunca, de modo
 *    que ni se puede iniciar sesión. Sólo se reescribe para los dominios de la
 *    lista: cualquier otro origen sigue chocando con la comprobación intacta.
 */
export function middleware(peticion: NextRequest) {
  const cabeceras = new Headers(peticion.headers);
  cabeceras.set('x-ruta', peticion.nextUrl.pathname);

  const origen = peticion.headers.get('origin');
  if (origen) {
    try {
      const hostDelOrigen = new URL(origen).host;
      if (esProxyConfiable(hostDelOrigen)) {
        cabeceras.set('x-forwarded-host', hostDelOrigen);
      }
    } catch {
      // Un origen mal formado se deja tal cual y lo rechaza la comprobación.
    }
  }

  return NextResponse.next({ request: { headers: cabeceras } });
}

export const config = {
  // Todo salvo los archivos estáticos y los recursos internos de Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
