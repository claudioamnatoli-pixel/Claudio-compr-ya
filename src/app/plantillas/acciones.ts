'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ESTADOS_LEAD } from '@/lib/dominio';
import { prisma } from '@/lib/prisma';
import {
  exito,
  fallo,
  textoObligatorio,
  validar,
  type ResultadoAccion,
} from '@/lib/acciones';

const esquemaPlantilla = z.object({
  nombre: textoObligatorio('Ponle nombre a la plantilla'),
  etapa: z.string().refine(ESTADOS_LEAD.esValido, { message: 'Etapa no válida' }),
  cuerpo: textoObligatorio('El texto de la plantilla no puede ir vacío'),
});

export async function crearPlantilla(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const resultado = validar(esquemaPlantilla, formData);
  if (!resultado.ok) return fallo(resultado.error);

  const repetida = await prisma.plantillaWhatsApp.findUnique({
    where: { nombre: resultado.datos.nombre },
  });
  if (repetida) return fallo('Ya existe una plantilla con ese nombre.');

  await prisma.plantillaWhatsApp.create({ data: resultado.datos });

  revalidatePath('/plantillas');
  return exito('Plantilla creada.');
}

const esquemaEdicion = esquemaPlantilla.extend({ plantillaId: textoObligatorio() });

export async function actualizarPlantilla(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const resultado = validar(esquemaEdicion, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { plantillaId, ...datos } = resultado.datos;

  const otra = await prisma.plantillaWhatsApp.findFirst({
    where: { nombre: datos.nombre, id: { not: plantillaId } },
    select: { id: true },
  });
  if (otra) return fallo('Ya existe otra plantilla con ese nombre.');

  await prisma.plantillaWhatsApp.update({ where: { id: plantillaId }, data: datos });

  revalidatePath('/plantillas');
  return exito('Plantilla actualizada.');
}

const esquemaEstado = z.object({
  plantillaId: textoObligatorio(),
  activa: z.enum(['1', '0']),
});

export async function cambiarEstadoPlantilla(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const resultado = validar(esquemaEstado, formData);
  if (!resultado.ok) return fallo(resultado.error);

  await prisma.plantillaWhatsApp.update({
    where: { id: resultado.datos.plantillaId },
    data: { activa: resultado.datos.activa === '1' },
  });

  revalidatePath('/plantillas');
  return exito('Plantilla actualizada.');
}
