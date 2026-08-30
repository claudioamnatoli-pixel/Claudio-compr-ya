'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  cerrarSesion,
  iniciarSesion,
  limpiarSesionesCaducadas,
  usuarioActual,
  verificarPassword,
} from '@/lib/auth';
import { inicioDe } from '@/lib/permisos';
import { prisma } from '@/lib/prisma';
import { fallo, textoObligatorio, validar, type ResultadoAccion } from '@/lib/acciones';

const esquemaAcceso = z.object({
  email: textoObligatorio('Escribe tu correo'),
  password: textoObligatorio('Escribe tu contraseña'),
});

export async function iniciarSesionAccion(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const resultado = validar(esquemaAcceso, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { email, password } = resultado.datos;

  const empleado = await prisma.empleado.findUnique({
    where: { email: email.toLowerCase() },
  });

  // El mismo mensaje tanto si el correo no existe como si la contraseña falla:
  // decir cuál de las dos cosa falló le regala al atacante media respuesta.
  const generico = fallo('Correo o contraseña incorrectos.');

  if (!empleado || !empleado.passwordHash) {
    // Se verifica igual contra un hash de descarte para que la respuesta tarde
    // lo mismo exista o no la cuenta.
    verificarPassword(password, 'scrypt$00$00');
    return generico;
  }
  if (!verificarPassword(password, empleado.passwordHash)) return generico;
  if (!empleado.activo) {
    return fallo('Esta cuenta está dada de baja. Habla con administración.');
  }

  const cabeceras = await headers();
  await iniciarSesion(empleado.id, cabeceras.get('user-agent'));
  await limpiarSesionesCaducadas();

  redirect(empleado.debeCambiarPassword ? '/cambiar-password' : inicioDe(empleado.rol));
}

export async function cerrarSesionAccion() {
  await cerrarSesion();
  redirect('/login');
}

/** Ruta a la que mandar a alguien que ya tiene sesión abierta. */
export async function destinoSiYaEntro(): Promise<string | null> {
  const usuario = await usuarioActual();
  if (!usuario) return null;
  return usuario.debeCambiarPassword ? '/cambiar-password' : inicioDe(usuario.rol);
}
