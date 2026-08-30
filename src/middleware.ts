import { NextResponse, type NextRequest } from 'next/server';

/**
 * Copia la ruta pedida a una cabecera para que el layout del panel pueda saber
 * qué página se está pidiendo y comprobar el permiso antes de empezar a
 * dibujar. No consulta la base de datos: aquí sólo se anota el destino.
 */
export function middleware(peticion: NextRequest) {
  const cabeceras = new Headers(peticion.headers);
  cabeceras.set('x-ruta', peticion.nextUrl.pathname);
  return NextResponse.next({ request: { headers: cabeceras } });
}

export const config = {
  // Todo salvo los archivos estáticos y los recursos internos de Next.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
