import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { hashearPassword, revisarPassword, verificarPassword } from './password';
import { prisma } from './prisma';

// Se reexportan para que el resto del código tenga un único punto de entrada.
export { hashearPassword, revisarPassword, verificarPassword };

const NOMBRE_COOKIE = 'compr_ya_sesion';
const DURACION_DIAS = 30;

/**
 * Clave con la que se derivan los identificadores de sesión guardados en la
 * base. Sin ella, quien consiguiera una copia de la base podría fabricar una
 * cookie válida; con ella hace falta además el secreto del servidor.
 */
function secreto(): string {
  const valor = process.env.SESSION_SECRET;
  if (valor && valor.length >= 16) return valor;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Falta SESSION_SECRET (mínimo 16 caracteres). Genera uno con: openssl rand -base64 32',
    );
  }
  // En desarrollo se permite arrancar sin configurarlo, para no estorbar.
  return 'secreto-de-desarrollo-no-apto-para-produccion';
}

// --- Sesiones ---------------------------------------------------------------

function huellaDelToken(token: string): string {
  return createHmac('sha256', secreto()).update(token).digest('hex');
}

/** Crea la sesión en la base y deja la cookie en la respuesta. */
export async function iniciarSesion(empleadoId: string, agente?: string | null) {
  const token = randomBytes(32).toString('base64url');
  const expiraAt = new Date(Date.now() + DURACION_DIAS * 24 * 60 * 60 * 1000);

  await prisma.sesion.create({
    data: {
      tokenHash: huellaDelToken(token),
      empleadoId,
      expiraAt,
      agente: agente?.slice(0, 200) ?? null,
    },
  });
  await prisma.empleado.update({
    where: { id: empleadoId },
    data: { ultimoAccesoAt: new Date() },
  });

  const almacen = await cookies();
  almacen.set(NOMBRE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiraAt,
  });
}

/** Cierra la sesión actual y borra la cookie. */
export async function cerrarSesion() {
  const almacen = await cookies();
  const token = almacen.get(NOMBRE_COOKIE)?.value;
  if (token) {
    await prisma.sesion.deleteMany({ where: { tokenHash: huellaDelToken(token) } });
  }
  almacen.delete(NOMBRE_COOKIE);
}

export type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  equipoId: string | null;
  debeCambiarPassword: boolean;
};

/**
 * Quién está usando el sistema, o null si nadie.
 *
 * Va envuelto en `cache()` para que las varias comprobaciones que hace una
 * misma página (el layout, la página y cada acción) compartan una sola consulta.
 */
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const almacen = await cookies();
  const token = almacen.get(NOMBRE_COOKIE)?.value;
  if (!token) return null;

  const sesion = await prisma.sesion.findUnique({
    where: { tokenHash: huellaDelToken(token) },
    include: { empleado: true },
  });
  if (!sesion) return null;

  // Una sesión caducada, o de alguien dado de baja, no vale.
  if (sesion.expiraAt < new Date() || !sesion.empleado.activo) {
    await prisma.sesion.delete({ where: { id: sesion.id } }).catch(() => {});
    return null;
  }

  return {
    id: sesion.empleado.id,
    nombre: sesion.empleado.nombre,
    email: sesion.empleado.email,
    rol: sesion.empleado.rol,
    equipoId: sesion.empleado.equipoId,
    debeCambiarPassword: sesion.empleado.debeCambiarPassword,
  };
});

/** Cierra todas las sesiones abiertas de una persona. */
export async function cerrarSesionesDe(empleadoId: string) {
  await prisma.sesion.deleteMany({ where: { empleadoId } });
}

/** Borra las sesiones caducadas. Se llama al iniciar sesión, sin bloquear. */
export async function limpiarSesionesCaducadas() {
  await prisma.sesion.deleteMany({ where: { expiraAt: { lt: new Date() } } });
}
