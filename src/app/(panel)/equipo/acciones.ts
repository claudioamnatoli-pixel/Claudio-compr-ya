'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ESTADOS_ASISTENCIA, ROLES } from '@/lib/dominio';
import { autorizar } from '@/lib/guardias';
import { prisma } from '@/lib/prisma';
import {
  dineroEnUnidadMinima,
  exito,
  fallo,
  textoObligatorio,
  textoOpcional,
  validar,
  type ResultadoAccion,
} from '@/lib/acciones';

/** La tasa se captura en porcentaje ("8") y se guarda como fracción (0.08). */
const tasaComision = z
  .string()
  .optional()
  .transform((valor) => Number(String(valor ?? '0').replace(',', '.')))
  .refine((numero) => Number.isFinite(numero) && numero >= 0 && numero <= 100, {
    message: 'La comisión debe estar entre 0 y 100 %',
  })
  .transform((numero) => numero / 100);

const esquemaEmpleado = z.object({
  nombre: textoObligatorio('Escribe el nombre completo'),
  email: z.string().email('El correo no es válido'),
  telefono: textoObligatorio('Escribe el teléfono'),
  rol: z.string().refine(ROLES.esValido, { message: 'Rol no válido' }),
  equipoId: textoOpcional(),
  salarioBase: dineroEnUnidadMinima('Escribe un sueldo válido'),
  metaMensual: dineroEnUnidadMinima('Escribe una meta válida'),
  tasaComision,
  notas: textoOpcional(),
});

export async function crearEmpleado(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('equipo.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaEmpleado, formData);
  if (!resultado.ok) return fallo(resultado.error);

  const repetido = await prisma.empleado.findUnique({
    where: { email: resultado.datos.email },
  });
  if (repetido) return fallo('Ya hay alguien registrado con ese correo.');

  const empleado = await prisma.empleado.create({ data: resultado.datos });

  revalidatePath('/equipo');
  redirect(`/equipo/${empleado.id}`);
}

const esquemaEdicion = esquemaEmpleado.extend({
  empleadoId: textoObligatorio(),
  activo: z.union([z.literal('on'), z.undefined()]).transform((valor) => valor === 'on'),
});

export async function actualizarEmpleado(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('equipo.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaEdicion, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { empleadoId, activo, ...datos } = resultado.datos;

  const otro = await prisma.empleado.findFirst({
    where: { email: datos.email, id: { not: empleadoId } },
    select: { id: true },
  });
  if (otro) return fallo('Ese correo ya lo usa otra persona del equipo.');

  const actual = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    select: { activo: true },
  });

  await prisma.empleado.update({
    where: { id: empleadoId },
    data: {
      ...datos,
      activo,
      // La fecha de baja se sella al desactivar y se limpia al reincorporar.
      fechaBaja: activo ? null : (actual?.activo === false ? undefined : new Date()),
    },
  });

  revalidatePath(`/equipo/${empleadoId}`);
  revalidatePath('/equipo');
  return exito('Datos del empleado actualizados.');
}

const esquemaAsistencia = z.object({
  empleadoId: textoObligatorio(),
  fecha: textoObligatorio('Elige la fecha'),
  estado: z
    .string()
    .refine(ESTADOS_ASISTENCIA.esValido, { message: 'Estado de asistencia no válido' }),
  notas: textoOpcional(),
});

export async function registrarAsistencia(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('asistencia.registrar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaAsistencia, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { empleadoId, fecha, estado, notas } = resultado.datos;

  // Se guarda a medianoche local para que haya una sola fila por día y persona.
  const dia = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(dia.getTime())) return fallo('La fecha no es válida.');

  await prisma.asistencia.upsert({
    where: { empleadoId_fecha: { empleadoId, fecha: dia } },
    create: { empleadoId, fecha: dia, estado, notas },
    update: { estado, notas },
  });

  revalidatePath(`/equipo/${empleadoId}`);
  return exito('Asistencia registrada.');
}

const esquemaPagoComisiones = z.object({
  empleadoId: textoObligatorio(),
  periodo: textoObligatorio(),
});

/** Marca como pagadas las comisiones ya aprobadas de un periodo. */
export async function pagarComisiones(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('equipo.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaPagoComisiones, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { empleadoId, periodo } = resultado.datos;

  const { count } = await prisma.comision.updateMany({
    where: { empleadoId, periodo, estado: 'APROBADA' },
    data: { estado: 'PAGADA', pagadaAt: new Date() },
  });

  if (count === 0) {
    return fallo('No hay comisiones aprobadas pendientes de pago en este periodo.');
  }

  revalidatePath(`/equipo/${empleadoId}`);
  revalidatePath('/equipo');
  return exito(`${count} comisión(es) marcadas como pagadas.`);
}

const esquemaEquipo = z.object({
  nombre: textoObligatorio('Ponle nombre al equipo'),
  descripcion: textoOpcional(),
  metaMensual: dineroEnUnidadMinima('Escribe una meta válida'),
  liderId: textoOpcional(),
});

export async function crearEquipo(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('equipo.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaEquipo, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { liderId, ...datos } = resultado.datos;

  const repetido = await prisma.equipo.findUnique({ where: { nombre: datos.nombre } });
  if (repetido) return fallo('Ya existe un equipo con ese nombre.');

  if (liderId) {
    const yaLidera = await prisma.equipo.findFirst({ where: { liderId }, select: { nombre: true } });
    if (yaLidera) return fallo(`Esa persona ya lidera «${yaLidera.nombre}».`);
  }

  await prisma.equipo.create({ data: { ...datos, liderId } });

  revalidatePath('/equipo');
  return exito('Equipo creado.');
}
