import 'server-only';
import { redirect } from 'next/navigation';
import { usuarioActual, type Usuario } from './auth';
import { inicioDe, puede, puedeVerEmpleado, type Permiso } from './permisos';
import { prisma } from './prisma';
import { fallo, type ResultadoAccion } from './acciones';

/**
 * Guarda para páginas: exige sesión y, si se indica, un permiso. Redirige en
 * lugar de mostrar un error, que es lo que espera alguien navegando.
 */
export async function requerirPagina(permiso?: Permiso): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login');

  // Quien tiene una contraseña provisional no entra a ningún lado hasta cambiarla.
  if (usuario.debeCambiarPassword) redirect('/cambiar-password');

  if (permiso && !puede(usuario.rol, permiso)) redirect(inicioDe(usuario.rol));
  return usuario;
}

/** Igual que `requerirPagina`, pero sólo comprueba que haya sesión. */
export async function requerirSesion(): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login');
  return usuario;
}

type Autorizacion =
  | { ok: true; usuario: Usuario }
  | { ok: false; respuesta: ResultadoAccion };

/**
 * Guarda para Server Actions. Devuelve el usuario o una respuesta de error ya
 * lista para retornar, porque una acción no debe redirigir: tiene que decirle
 * a la persona qué pasó.
 *
 * Se comprueba en cada acción y no sólo al pintar la página: los botones
 * ocultos no protegen nada, ya que una petición se puede enviar a mano.
 */
export async function autorizar(permiso: Permiso): Promise<Autorizacion> {
  const usuario = await usuarioActual();
  if (!usuario) {
    return { ok: false, respuesta: fallo('Tu sesión expiró. Vuelve a iniciar sesión.') };
  }
  if (!puede(usuario.rol, permiso)) {
    return { ok: false, respuesta: fallo('No tienes permiso para hacer esto.') };
  }
  return { ok: true, usuario };
}

/**
 * Comprobaciones que dependen del registro concreto, no sólo de la ruta: la
 * ficha de una persona y el prospecto de otra.
 *
 * Vive junto al layout, antes de dibujar nada, para que denegar el acceso sea
 * una redirección HTTP y no un salto en el navegador. Las páginas repiten la
 * comprobación por su cuenta.
 */
export async function requerirAccesoAlRegistro(usuario: Usuario, ruta: string) {
  const ficha = /^\/equipo\/([^/]+)$/.exec(ruta);
  if (ficha && ficha[1] !== 'nuevo' && !puedeVerEmpleado(usuario, ficha[1])) {
    redirect(inicioDe(usuario.rol));
  }

  const prospecto = /^\/leads\/([^/]+)$/.exec(ruta);
  if (prospecto && prospecto[1] !== 'nuevo' && !puede(usuario.rol, 'leads.verTodos')) {
    const registro = await prisma.lead.findUnique({
      where: { id: prospecto[1] },
      select: { vendedorId: true },
    });
    // Un prospecto sin responsable está disponible para quien lo tome.
    if (registro?.vendedorId && registro.vendedorId !== usuario.id) {
      redirect(inicioDe(usuario.rol));
    }
  }
}
