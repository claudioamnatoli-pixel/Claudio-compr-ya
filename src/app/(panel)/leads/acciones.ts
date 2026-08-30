'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { generarCodigoLead } from '@/lib/codigos';
import { ESTADOS_LEAD, ORIGENES_LEAD } from '@/lib/dominio';
import { puede } from '@/lib/permisos';
import { autorizar } from '@/lib/guardias';
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
  const guardia = await autorizar('leads.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaLead, formData);
  if (!resultado.ok) return fallo(resultado.error);

  // Quien no puede ver los prospectos ajenos tampoco puede endosárselos a
  // otra persona: el prospecto que registra queda a su nombre.
  const vendedorId = puede(guardia.usuario.rol, 'leads.verTodos')
    ? resultado.datos.vendedorId
    : guardia.usuario.id;

  const codigo = await generarCodigoLead();
  const lead = await prisma.lead.create({
    data: {
      ...resultado.datos,
      vendedorId,
      codigo,
      estado: vendedorId ? 'CONTACTADO' : 'NUEVO',
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
  const guardia = await autorizar('leads.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaActualizacion, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { leadId, estado, vendedorId, motivoPerdida, notas } = resultado.datos;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { vendedorId: true },
  });
  if (!lead) return fallo('El prospecto ya no existe.');

  const veTodos = puede(guardia.usuario.rol, 'leads.verTodos');
  if (!veTodos && lead.vendedorId && lead.vendedorId !== guardia.usuario.id) {
    return fallo('Este prospecto está asignado a otra persona.');
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      estado,
      // Un vendedor no reasigna prospectos: si toca uno libre, se lo queda.
      vendedorId: veTodos ? vendedorId : (lead.vendedorId ?? guardia.usuario.id),
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
  const guardia = await autorizar('leads.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaMensaje, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { leadId, direccion, cuerpo, plantillaId } = resultado.datos;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { estado: true, vendedorId: true },
  });
  if (!lead) return fallo('El prospecto ya no existe.');

  if (
    !puede(guardia.usuario.rol, 'leads.verTodos') &&
    lead.vendedorId &&
    lead.vendedorId !== guardia.usuario.id
  ) {
    return fallo('Este prospecto está asignado a otra persona.');
  }

  // El autor del mensaje es quien tiene la sesión abierta, no lo que diga el
  // formulario: así el historial dice quién escribió de verdad.
  const empleadoId = guardia.usuario.id;

  await prisma.$transaction([
    prisma.mensajeWhatsApp.create({
      data: {
        leadId,
        direccion,
        cuerpo,
        plantillaId,
        empleadoId,
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
