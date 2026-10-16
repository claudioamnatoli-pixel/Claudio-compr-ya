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
import { auditar } from '@/lib/auditoria';
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
  const { password } = resultado.datos;
  const email = resultado.datos.email.toLowerCase();

  // El freno va antes de buscar nada y antes de verificar la contraseña: si
  // fuera después, probar contraseñas seguiría costando lo mismo y el bloqueo
  // no serviría de nada.
  const espera = await minutosDeEspera(email);
  if (espera > 0) {
    return fallo(
      `Demasiados intentos fallidos con este correo. Probá de nuevo en ${espera} ` +
        (espera === 1 ? 'minuto.' : 'minutos.'),
    );
  }

  const empleado = await prisma.empleado.findUnique({
    where: { email },
  });

  // El mismo mensaje tanto si el correo no existe como si la contraseña falla:
  // decir cuál de las dos cosa falló le regala al atacante media respuesta.
  const generico = fallo('Correo o contraseña incorrectos.');

  if (!empleado || !empleado.passwordHash) {
    // Se verifica igual contra un hash de descarte para que la respuesta tarde
    // lo mismo exista o no la cuenta.
    verificarPassword(password, 'scrypt$00$00');
    await registrarIntentoFallido(email);
    return generico;
  }
  if (!verificarPassword(password, empleado.passwordHash)) {
    await registrarIntentoFallido(email, empleado.nombre);
    return generico;
  }
  if (!empleado.activo) {
    return fallo('Esta cuenta está dada de baja. Habla con administración.');
  }

  const cabeceras = await headers();
  await iniciarSesion(empleado.id, cabeceras.get('user-agent'));
  await limpiarSesionesCaducadas();
  await auditar(prisma, {
    accion: 'sesion.iniciada',
    entidad: 'Empleado',
    entidadId: empleado.id,
    resumen: `${empleado.nombre} inició sesión`,
    actor: { id: empleado.id, nombre: empleado.nombre },
  });

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

/** Cuántos fallos seguidos se toleran, y en cuánto tiempo se perdonan. */
const INTENTOS_PERMITIDOS = 10;
const VENTANA_MINUTOS = 15;

/**
 * Minutos que faltan para poder volver a probar con este correo, o 0 si se
 * puede ahora.
 *
 * Se cuenta por correo y no por cuenta a propósito: si sólo se frenaran los
 * correos existentes, el bloqueo contestaría «esta cuenta existe» a quien
 * probara al azar. Así, un correo inventado se frena igual que uno real.
 *
 * El perdón es por antigüedad, no por acierto: los fallos salen de la ventana
 * solos. Quien se equivocó unas veces y entró bien sigue con esos fallos
 * contados un rato, lo cual es inofensivo mientras queden lejos del límite.
 */
async function minutosDeEspera(email: string): Promise<number> {
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60_000);
  const fallos = await prisma.auditoria.findMany({
    where: { accion: 'sesion.fallida', actor: email, createdAt: { gte: desde } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
    take: INTENTOS_PERMITIDOS,
  });
  if (fallos.length < INTENTOS_PERMITIDOS) return 0;

  // Se abre de nuevo cuando el más viejo de los fallos salga de la ventana.
  const liberaEn = fallos[0].createdAt.getTime() + VENTANA_MINUTOS * 60_000;
  return Math.max(1, Math.ceil((liberaEn - Date.now()) / 60_000));
}

/**
 * Deja constancia de un intento de acceso fallido. Es lo que permite notar que
 * alguien está probando contraseñas; nunca se guarda lo que se intentó como
 * contraseña, sólo el correo con el que se probó.
 *
 * En `actor` va siempre el correo, nunca el nombre: es lo que cuenta
 * `minutosDeEspera`, y tiene que poder contar igual exista o no la cuenta. El
 * nombre, cuando se conoce, va en el resumen, que es lo que se lee en pantalla.
 */
async function registrarIntentoFallido(email: string, nombre?: string) {
  await auditar(prisma, {
    accion: 'sesion.fallida',
    entidad: 'Empleado',
    resumen: nombre
      ? `Contraseña incorrecta para ${nombre} (${email})`
      : `Intento de acceso con un correo no registrado: ${email}`,
    actor: { nombre: email },
  });
}
