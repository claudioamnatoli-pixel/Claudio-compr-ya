'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auditar, compararCampos } from '@/lib/auditoria';
import { CATEGORIAS_GASTO } from '@/lib/dominio';
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

const esquemaGasto = z.object({
  categoria: textoObligatorio('Elegí la categoría'),
  descripcion: textoObligatorio('Escribí de qué es el gasto'),
  monto: dineroEnUnidadMinima('Escribí un importe válido'),
  fecha: textoObligatorio('Poné la fecha'),
  comprobante: textoOpcional(),
  proveedorId: textoOpcional(),
});

/** La fecha llega como "2026-10-17" desde un input date. */
function aFecha(texto: string): Date | null {
  const fecha = new Date(`${texto}T12:00:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export async function crearGasto(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('gastos.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaGasto, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { fecha: fechaTexto, proveedorId, ...datos } = resultado.datos;

  if (!CATEGORIAS_GASTO.esValido(datos.categoria)) {
    return fallo('Esa categoría no existe.');
  }
  if (datos.monto <= 0) return fallo('El importe tiene que ser mayor que cero.');

  const fecha = aFecha(fechaTexto);
  if (!fecha) return fallo('Esa fecha no es válida.');

  const gasto = await prisma.gasto.create({
    data: {
      ...datos,
      fecha,
      proveedorId: proveedorId || null,
      empleadoId: guardia.usuario.id,
    },
  });

  await auditar(prisma, {
    accion: 'gasto.crear',
    entidad: 'Gasto',
    entidadId: gasto.id,
    resumen: `${CATEGORIAS_GASTO.etiqueta(gasto.categoria)}: ${gasto.descripcion} por ${gasto.monto}`,
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/gastos');
  revalidatePath('/contabilidad');
  return exito('Gasto registrado.');
}

export async function actualizarGasto(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('gastos.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const id = String(formData.get('id') ?? '');
  const antes = await prisma.gasto.findUnique({ where: { id } });
  if (!antes) return fallo('Ese gasto ya no existe.');

  const resultado = validar(esquemaGasto, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { fecha: fechaTexto, proveedorId, ...datos } = resultado.datos;

  if (!CATEGORIAS_GASTO.esValido(datos.categoria)) {
    return fallo('Esa categoría no existe.');
  }
  if (datos.monto <= 0) return fallo('El importe tiene que ser mayor que cero.');

  const fecha = aFecha(fechaTexto);
  if (!fecha) return fallo('Esa fecha no es válida.');

  const despues = await prisma.gasto.update({
    where: { id },
    data: { ...datos, fecha, proveedorId: proveedorId || null },
  });

  const cambios = compararCampos(antes, despues, [
    'categoria',
    'descripcion',
    'monto',
    'comprobante',
  ]);
  if (cambios) {
    await auditar(prisma, {
      accion: 'gasto.actualizar',
      entidad: 'Gasto',
      entidadId: id,
      resumen: `Gasto corregido: ${despues.descripcion}`,
      cambios,
      actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
    });
  }

  revalidatePath('/gastos');
  revalidatePath('/contabilidad');
  return exito('Gasto actualizado.');
}

export async function eliminarGasto(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('gastos.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const id = String(formData.get('id') ?? '');
  const gasto = await prisma.gasto.findUnique({ where: { id } });
  if (!gasto) return fallo('Ese gasto ya no existe.');

  await prisma.gasto.delete({ where: { id } });

  await auditar(prisma, {
    accion: 'gasto.eliminar',
    entidad: 'Gasto',
    entidadId: id,
    resumen: `Gasto eliminado: ${gasto.descripcion} por ${gasto.monto}`,
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/gastos');
  revalidatePath('/contabilidad');
  return exito('Gasto eliminado.');
}
