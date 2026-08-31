'use server';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { exito, fallo, type ResultadoAccion } from '@/lib/acciones';

const ejecutar = promisify(execFile);

/**
 * Carga los datos de ejemplo desde la propia pantalla de acceso.
 *
 * Existe para el caso en que la preparación inicial falló y la base quedó sin
 * ninguna cuenta: sin esto, el formulario responde «correo o contraseña
 * incorrectos» y no hay forma de entrar ni de saber por qué, salvo abrir una
 * terminal.
 *
 * Sólo actúa sobre una base vacía. Esa condición se comprueba aquí y otra vez
 * dentro del propio sembrado, de modo que no puede borrar el trabajo de nadie
 * aunque alguien llame a la acción a mano.
 */
export async function sembrarDatosDeEjemplo(
  _estadoPrevio: ResultadoAccion | null,
): Promise<ResultadoAccion> {
  const cuentas = await prisma.empleado.count();
  if (cuentas > 0) {
    return fallo('La base ya tiene cuentas: no se cargan datos de ejemplo encima.');
  }

  try {
    await ejecutar('npx', ['--yes', 'tsx', 'prisma/seed.ts', '--solo-si-vacia'], {
      cwd: process.cwd(),
      timeout: 120_000,
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return fallo(`No se pudieron cargar los datos de ejemplo. ${detalle.slice(0, 300)}`);
  }

  const creadas = await prisma.empleado.count();
  if (creadas === 0) {
    return fallo('El proceso terminó pero no se creó ninguna cuenta.');
  }

  revalidatePath('/login');
  return exito(`Listo: se crearon ${creadas} cuentas. Ya podés entrar.`);
}
