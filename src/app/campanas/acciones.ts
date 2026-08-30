'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { TIPOS_CAMPANA } from '@/lib/dominio';
import { prisma } from '@/lib/prisma';
import {
  dineroEnCentavos,
  exito,
  fallo,
  textoObligatorio,
  textoOpcional,
  validar,
  type ResultadoAccion,
} from '@/lib/acciones';

const esquemaCampana = z.object({
  nombre: textoObligatorio('Ponle nombre a la campaña'),
  tipo: z.string().refine(TIPOS_CAMPANA.esValido, { message: 'Tipo de campaña no válido' }),
  urlVideo: textoOpcional(),
  hashtags: textoOpcional(),
  presupuesto: dineroEnCentavos('Escribe un presupuesto válido'),
});

export async function crearCampana(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const resultado = validar(esquemaCampana, formData);
  if (!resultado.ok) return fallo(resultado.error);

  await prisma.campana.create({ data: resultado.datos });

  revalidatePath('/campanas');
  revalidatePath('/');
  return exito('Campaña creada.');
}

const esquemaEstado = z.object({
  campanaId: textoObligatorio(),
  activa: z.enum(['1', '0']),
});

export async function cambiarEstadoCampana(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const resultado = validar(esquemaEstado, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { campanaId, activa } = resultado.datos;
  const encender = activa === '1';

  await prisma.campana.update({
    where: { id: campanaId },
    data: { activa: encender, fechaFin: encender ? null : new Date() },
  });

  revalidatePath('/campanas');
  return exito(encender ? 'Campaña reactivada.' : 'Campaña cerrada.');
}
