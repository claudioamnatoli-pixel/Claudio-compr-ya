'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auditar, compararCampos } from '@/lib/auditoria';
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

const esquemaProveedor = z.object({
  nombre: textoObligatorio('El nombre es obligatorio'),
  ruc: textoOpcional(),
  contacto: textoOpcional(),
  telefono: textoOpcional(),
  notas: textoOpcional(),
});

export async function crearProveedor(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('compras.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaProveedor, formData);
  if (!resultado.ok) return fallo(resultado.error);

  const proveedor = await prisma.proveedor.create({ data: resultado.datos });

  await auditar(prisma, {
    accion: 'proveedor.crear',
    entidad: 'Proveedor',
    entidadId: proveedor.id,
    resumen: `Alta del proveedor ${proveedor.nombre}`,
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/proveedores');
  return exito(`Proveedor ${proveedor.nombre} dado de alta.`);
}

export async function actualizarProveedor(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('compras.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const id = String(formData.get('id') ?? '');
  const antes = await prisma.proveedor.findUnique({ where: { id } });
  if (!antes) return fallo('Ese proveedor ya no existe.');

  const resultado = validar(esquemaProveedor, formData);
  if (!resultado.ok) return fallo(resultado.error);

  const despues = await prisma.proveedor.update({
    where: { id },
    data: resultado.datos,
  });

  const cambios = compararCampos(antes, despues, [
    'nombre',
    'ruc',
    'contacto',
    'telefono',
    'notas',
  ]);
  if (cambios) {
    await auditar(prisma, {
      accion: 'proveedor.actualizar',
      entidad: 'Proveedor',
      entidadId: id,
      resumen: `Datos de ${despues.nombre} actualizados`,
      cambios,
      actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
    });
  }

  revalidatePath('/proveedores');
  return exito('Proveedor actualizado.');
}

export async function cambiarEstadoProveedor(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('compras.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const id = String(formData.get('id') ?? '');
  const proveedor = await prisma.proveedor.findUnique({ where: { id } });
  if (!proveedor) return fallo('Ese proveedor ya no existe.');

  const activo = !proveedor.activo;
  await prisma.proveedor.update({ where: { id }, data: { activo } });

  await auditar(prisma, {
    accion: activo ? 'proveedor.reactivar' : 'proveedor.desactivar',
    entidad: 'Proveedor',
    entidadId: id,
    resumen: `${proveedor.nombre} ${activo ? 'reactivado' : 'dado de baja'}`,
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/proveedores');
  return exito(activo ? 'Proveedor reactivado.' : 'Proveedor dado de baja.');
}
