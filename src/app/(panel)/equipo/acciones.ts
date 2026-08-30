'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auditar, compararCampos } from '@/lib/auditoria';
import {
  generarPasswordProvisional,
  hashearPassword,
  revisarPassword,
} from '@/lib/auth';
import { ESTADOS_ASISTENCIA, ROLES } from '@/lib/dominio';
import { formatearDinero, formatearPeriodo } from '@/lib/formato';
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

  const empleado = await prisma.$transaction(async (tx) => {
    const creado = await tx.empleado.create({ data: resultado.datos });
    await auditar(tx, {
      accion: 'empleado.crear',
      entidad: 'Empleado',
      entidadId: creado.id,
      resumen: `Alta de ${creado.nombre} como ${ROLES.etiqueta(creado.rol).toLowerCase()}`,
      actor: guardia.usuario,
    });
    return creado;
  });

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

  const actual = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  if (!actual) return fallo('Esa persona ya no está registrada.');

  // Se compara antes de escribir para poder dejar constancia de qué cambió.
  const cambios = compararCampos({ ...actual, activo: actual.activo }, { ...datos, activo }, [
    'nombre',
    'email',
    'telefono',
    'rol',
    'equipoId',
    'salarioBase',
    'tasaComision',
    'metaMensual',
    'activo',
  ]);

  await prisma.$transaction(async (tx) => {
    await tx.empleado.update({
      where: { id: empleadoId },
      data: {
        ...datos,
        activo,
        // La fecha de baja se sella al desactivar y se limpia al reincorporar.
        fechaBaja: activo ? null : actual.activo === false ? undefined : new Date(),
      },
    });

    // Dar de baja a alguien le quita el acceso en el acto.
    if (!activo && actual.activo) {
      await tx.sesion.deleteMany({ where: { empleadoId } });
    }

    if (cambios) {
      await auditar(tx, {
        accion: 'empleado.actualizar',
        entidad: 'Empleado',
        entidadId: empleadoId,
        resumen: `Cambio de condiciones de ${actual.nombre}`,
        cambios,
        actor: guardia.usuario,
      });
    }
  });

  revalidatePath(`/equipo/${empleadoId}`);
  revalidatePath('/equipo');
  return exito(cambios ? 'Datos del empleado actualizados.' : 'No había nada que cambiar.');
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

  const pendientes = await prisma.comision.findMany({
    where: { empleadoId, periodo, estado: 'APROBADA' },
    select: { monto: true },
  });
  if (pendientes.length === 0) {
    return fallo('No hay comisiones aprobadas pendientes de pago en este periodo.');
  }
  const total = pendientes.reduce((suma, comision) => suma + comision.monto, 0);

  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    select: { nombre: true },
  });

  const { count } = await prisma.$transaction(async (tx) => {
    const resultadoPago = await tx.comision.updateMany({
      where: { empleadoId, periodo, estado: 'APROBADA' },
      data: { estado: 'PAGADA', pagadaAt: new Date() },
    });
    await auditar(tx, {
      accion: 'comision.pagar',
      entidad: 'Empleado',
      entidadId: empleadoId,
      resumen: `Pago de ${formatearDinero(total)} en comisiones a ${
        empleado?.nombre ?? 'alguien'
      } por ${formatearPeriodo(periodo)}`,
      actor: guardia.usuario,
    });
    return resultadoPago;
  });

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

  await prisma.$transaction(async (tx) => {
    const equipo = await tx.equipo.create({ data: { ...datos, liderId } });
    await auditar(tx, {
      accion: 'equipo.crear',
      entidad: 'Equipo',
      entidadId: equipo.id,
      resumen: `Alta del equipo ${equipo.nombre}`,
      actor: guardia.usuario,
    });
  });

  revalidatePath('/equipo');
  return exito('Equipo creado.');
}

const esquemaAcceso = z.object({
  empleadoId: textoObligatorio(),
  /// Opcional: si se deja vacío se genera una contraseña provisional.
  password: textoOpcional(),
});

/**
 * Da acceso al sistema a una persona, o le restablece la contraseña.
 *
 * La contraseña que se entrega es siempre provisional: quien entra con ella
 * tiene que cambiarla antes de llegar a ninguna pantalla, para que administración
 * no se quede sabiendo la clave con la que otro trabaja. Se muestra una sola vez,
 * al terminar; no se guarda en claro en ningún sitio.
 */
export async function otorgarAcceso(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('acceso.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaAcceso, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { empleadoId, password } = resultado.datos;

  const empleado = await prisma.empleado.findUnique({ where: { id: empleadoId } });
  if (!empleado) return fallo('Esa persona ya no está registrada.');
  if (!empleado.activo) {
    return fallo('No se puede dar acceso a alguien dado de baja. Reactívala primero.');
  }

  if (password) {
    const problema = revisarPassword(password);
    if (problema) return fallo(problema);
  }
  const provisional = password ?? generarPasswordProvisional();

  // El hash es costoso a propósito; se calcula fuera de la transacción para no
  // tener la base bloqueada mientras tanto.
  const hash = hashearPassword(provisional);
  const esRestablecimiento = empleado.passwordHash !== null;

  await prisma.$transaction(async (tx) => {
    await tx.empleado.update({
      where: { id: empleadoId },
      data: { passwordHash: hash, debeCambiarPassword: true },
    });
    // Si es un restablecimiento, quien tuviera la contraseña anterior deja de
    // tener acceso en el acto.
    await tx.sesion.deleteMany({ where: { empleadoId } });
    await auditar(tx, {
      accion: 'empleado.acceso_otorgado',
      entidad: 'Empleado',
      entidadId: empleadoId,
      resumen: esRestablecimiento
        ? `Contraseña restablecida a ${empleado.nombre}`
        : `Acceso otorgado a ${empleado.nombre}`,
      actor: guardia.usuario,
    });
  });

  // A propósito no se revalida la página: al volver a dibujarla se perdería el
  // mensaje, y con él la única vez que se muestra la contraseña. La ficha se
  // refresca cuando quien la reparte confirma que ya la anotó.
  return exito(
    esRestablecimiento
      ? `Contraseña restablecida a ${empleado.nombre}.`
      : `Acceso otorgado a ${empleado.nombre}.`,
    { password: provisional, nombre: empleado.nombre },
  );
}

const esquemaRevocar = z.object({ empleadoId: textoObligatorio() });

/** Quita el acceso al sistema sin dar de baja a la persona de la nómina. */
export async function revocarAcceso(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('acceso.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaRevocar, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { empleadoId } = resultado.datos;

  if (empleadoId === guardia.usuario.id) {
    return fallo('No puedes quitarte el acceso a ti misma o a ti mismo.');
  }

  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    select: { nombre: true, passwordHash: true },
  });
  if (!empleado) return fallo('Esa persona ya no está registrada.');
  if (!empleado.passwordHash) return fallo('Esa persona no tiene acceso al sistema.');

  await prisma.$transaction(async (tx) => {
    await tx.empleado.update({
      where: { id: empleadoId },
      data: { passwordHash: null, debeCambiarPassword: false },
    });
    await tx.sesion.deleteMany({ where: { empleadoId } });
    await auditar(tx, {
      accion: 'empleado.acceso_revocado',
      entidad: 'Empleado',
      entidadId: empleadoId,
      resumen: `Acceso revocado a ${empleado.nombre}`,
      actor: guardia.usuario,
    });
  });

  revalidatePath(`/equipo/${empleadoId}`);
  return exito(`${empleado.nombre} ya no puede entrar al sistema.`);
}
