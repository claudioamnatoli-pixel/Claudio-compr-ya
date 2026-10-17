'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auditar } from '@/lib/auditoria';
import { cobrosSinRendir } from '@/lib/caja';
import { generarNumeroRendicion } from '@/lib/codigos';
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

const esquemaRendicion = z.object({
  repartidorId: textoObligatorio('Elegí al repartidor'),
  declarado: dineroEnUnidadMinima('Escribí cuánto entregó'),
  notas: textoOpcional(),
});

/**
 * Cierra la caja de un repartidor: ata sus cobros pendientes a una rendición y
 * deja asentada la diferencia entre lo que el sistema esperaba y lo que trajo.
 *
 * Todo ocurre en una transacción, y el esperado se congela en el momento de
 * cerrar: si se recalculara después, una corrección posterior en un envío
 * cambiaría una diferencia que ya se discutió y se dio por saldada.
 */
export async function registrarRendicion(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('caja.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaRendicion, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { repartidorId, declarado, notas } = resultado.datos;

  if (declarado < 0) return fallo('Lo entregado no puede ser negativo.');

  const repartidor = await prisma.empleado.findUnique({ where: { id: repartidorId } });
  if (!repartidor) return fallo('Esa persona ya no existe.');

  const pendientes = await cobrosSinRendir(repartidorId);
  if (pendientes.length === 0) {
    return fallo(`${repartidor.nombre} no tiene cobros pendientes de rendir.`);
  }

  const esperado = pendientes.reduce((suma, e) => suma + (e.montoCobrado ?? 0), 0);
  const diferencia = declarado - esperado;
  const numero = await generarNumeroRendicion();

  const rendicion = await prisma.$transaction(async (tx) => {
    const creada = await tx.rendicion.create({
      data: {
        numero,
        repartidorId,
        recibidoPorId: guardia.usuario.id,
        esperado,
        declarado,
        diferencia,
        notas,
      },
    });
    // Sólo los envíos que se contaron: si entre el cálculo y el cierre entró
    // uno nuevo, queda pendiente para la próxima en vez de colarse sin estar
    // sumado en el esperado.
    await tx.envio.updateMany({
      where: { id: { in: pendientes.map((e) => e.id) }, rendicionId: null },
      data: { rendicionId: creada.id },
    });
    return creada;
  });

  await auditar(prisma, {
    accion: 'rendicion.registrar',
    entidad: 'Rendicion',
    entidadId: rendicion.id,
    resumen:
      `${numero}: ${repartidor.nombre} entregó ${declarado} de ${esperado} esperados` +
      (diferencia === 0 ? ' (sin diferencia)' : ` (diferencia ${diferencia})`),
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/caja');
  revalidatePath('/contabilidad');
  return exito(
    diferencia === 0
      ? `Caja de ${repartidor.nombre} cerrada sin diferencia.`
      : `Caja cerrada con una diferencia de ${diferencia}.`,
  );
}
