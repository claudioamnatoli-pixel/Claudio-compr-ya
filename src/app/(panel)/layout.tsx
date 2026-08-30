import { headers } from 'next/headers';
import { BarraLateral, BarraSuperior } from '@/components/navegacion';
import { requerirAccesoAlRegistro, requerirPagina } from '@/lib/guardias';
import { permisoDeRuta, permisosDe } from '@/lib/permisos';

/**
 * Todo lo que cuelga de este grupo de rutas exige sesión, y además el permiso
 * que corresponda a la ruta. Está en un solo sitio para que añadir una página
 * nueva no sea una ocasión de olvidarse de protegerla.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // El permiso se comprueba aquí, antes de dibujar nada, para que denegar el
  // acceso sea una redirección HTTP de verdad y no un salto en el navegador.
  // Cada página vuelve a comprobarlo por su cuenta: esto es comodidad, no la
  // única defensa.
  const ruta = (await headers()).get('x-ruta') ?? '';
  const usuario = await requerirPagina(permisoDeRuta(ruta) ?? undefined);
  await requerirAccesoAlRegistro(usuario, ruta);
  const permisos = permisosDe(usuario.rol);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <BarraSuperior usuario={usuario} permisos={permisos} />
      <BarraLateral usuario={usuario} permisos={permisos} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
