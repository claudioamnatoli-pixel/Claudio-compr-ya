'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  cerrarSesionesDe,
  hashearPassword,
  iniciarSesion,
  revisarPassword,
  usuarioActual,
  verificarPassword,
} from '@/lib/auth';
import { auditar } from '@/lib/auditoria';
import { inicioDe } from '@/lib/permisos';
import { prisma } from '@/lib/prisma';
import { fallo, textoObligatorio, validar, type ResultadoAccion } from '@/lib/acciones';

const esquema = z.object({
  actual: textoObligatorio('Escribe tu contraseña actual'),
  nueva: textoObligatorio('Escribe la contraseña nueva'),
  repetida: textoObligatorio('Repite la contraseña nueva'),
});

export async function cambiarPassword(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const usuario = await usuarioActual();
  if (!usuario) return fallo('Tu sesión expiró. Vuelve a iniciar sesión.');

  const resultado = validar(esquema, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { actual, nueva, repetida } = resultado.datos;

  if (nueva !== repetida) return fallo('Las dos contraseñas nuevas no coinciden.');
  if (nueva === actual) return fallo('La contraseña nueva tiene que ser distinta de la actual.');

  const problema = revisarPassword(nueva);
  if (problema) return fallo(problema);

  const empleado = await prisma.empleado.findUniqueOrThrow({ where: { id: usuario.id } });
  if (!verificarPassword(actual, empleado.passwordHash)) {
    return fallo('La contraseña actual no es correcta.');
  }

  const hash = hashearPassword(nueva);
  await prisma.$transaction(async (tx) => {
    await tx.empleado.update({
      where: { id: usuario.id },
      data: { passwordHash: hash, debeCambiarPassword: false },
    });
    await auditar(tx, {
      accion: 'password.cambiada',
      entidad: 'Empleado',
      entidadId: usuario.id,
      resumen: `${usuario.nombre} cambió su contraseña`,
      actor: usuario,
    });
  });

  // Cambiar la contraseña cierra las demás sesiones: si alguien había entrado
  // con la anterior, deja de tener acceso. La de aquí se vuelve a abrir.
  await cerrarSesionesDe(usuario.id);
  await iniciarSesion(usuario.id);

  redirect(inicioDe(usuario.rol));
}
