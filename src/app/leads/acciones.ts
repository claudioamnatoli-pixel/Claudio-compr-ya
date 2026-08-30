'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { generarCodigoLead } from '@/lib/codigos';
import { ESTADOS_LEAD, ORIGENES_LEAD } from '@/lib/dominio';
import { prisma } from '@/lib/prisma';
import {
  exito,
  fallo,
  textoObligatorio,
  textoOpcional,
  validar,
  type ResultadoAccion,
} from '@/lib/acciones';

const esquemaLead = z.object({
  nombre: textoObligatorio('Escribe el nombre del prospecto'),
  telefono: textoObligatorio('Escribe el teléfono de WhatsApp'),
  ciudad: textoOpcional(),
  origen: z.string().refine(ORIGENES_LEAD.esValido, { message: 'Origen no válido' }),
  campanaId: textoOpcional(),
  productoInteresId: textoOpcional(),
  vendedorId: textoOpcional(),
  notas: textoOpcional(),
});

export async function crearLead(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const resultado = validar(esquemaLead, formData);
  if (!resultado.ok) return fallo(resultado.error);

  const codigo = await generarCodigoLead();
  const lead = await prisma.lead.create({
    data: {
      ...resultado.datos,
      codigo,
      estado: resultado.datos.vendedorId ? 'CONTACTADO' : 'NUEVO',
    },
  });

  revalidatePath('/leads');
  revalidatePath('/');
  redirect(`/leads/${lead.id}`);
}

const esquemaActualizacion = z.object({
  leadId: textoObligatorio(),
  estado: z.string().refine(ESTADOS_LEAD.esValido, { message: 'Etapa no válida' }),
  vendedorId: textoOpcional(),
  motivoPerdida: textoOpcional(),
  notas: textoOpcional(),
});

export async function actualizarLead(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const resultado = validar(esquemaActualizacion, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { leadId, estado, vendedorId, motivoPerdida, notas } = resultado.datos;

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      estado,
      vendedorId,
      notas,
      // El motivo sólo tiene sentido en un prospecto perdido; si se reabre, se limpia.
      motivoPerdida: estado === 'PERDIDO' ? motivoPerdida : null,
    },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
  return exito('Prospecto actualizado.');
}

const esquemaMensaje = z.object({
  leadId: textoObligatorio(),
  direccion: z.enum(['SALIENTE', 'ENTRANTE']),
  cuerpo: textoObligatorio('El mensaje no puede ir vacío'),
  plantillaId: textoOpcional(),
  empleadoId: textoOpcional(),
});

/**
 * Guarda el mensaje en el historial del prospecto. La aplicación no envía por
 * WhatsApp: abre el chat con el texto listo mediante un enlace `wa.me` y aquí
 * se deja constancia de lo que se mandó.
 */
export async function registrarMensaje(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const resultado = validar(esquemaMensaje, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { leadId, direccion, cuerpo, plantillaId, empleadoId } = resultado.datos;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { estado: true, vendedorId: true },
  });
  if (!lead) return fallo('El prospecto ya no existe.');

  await prisma.$transaction([
    prisma.mensajeWhatsApp.create({
      data: {
        leadId,
        direccion,
        cuerpo,
        plantillaId,
        empleadoId: empleadoId ?? lead.vendedorId,
      },
    }),
    prisma.lead.update({
      where: { id: leadId },
      data: {
        ultimoContactoAt: new Date(),
        // El primer mensaje saca al prospecto de la bandeja de "nuevos".
        estado: lead.estado === 'NUEVO' ? 'CONTACTADO' : lead.estado,
        // Quien escribe se queda como responsable si nadie lo tenía asignado.
        vendedorId: lead.vendedorId ?? empleadoId,
      },
    }),
  ]);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
  return exito('Mensaje registrado en la conversación.');
}
