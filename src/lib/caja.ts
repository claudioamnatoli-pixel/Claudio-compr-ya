import { prisma } from './prisma';

/**
 * Cobros que un repartidor hizo en la calle y todavía no entregó.
 *
 * Un envío entra acá cuando está entregado y tiene efectivo cobrado, y sale
 * cuando queda atado a una rendición. Esa atadura es lo que impide que un cobro
 * se cuente dos veces o se pierda sin que nadie lo note.
 */
export async function cobrosSinRendir(repartidorId: string) {
  return prisma.envio.findMany({
    where: {
      repartidorId,
      estado: 'ENTREGADO',
      rendicionId: null,
      montoCobrado: { gt: 0 },
    },
    orderBy: { fechaEntrega: 'asc' },
    include: { pedido: { select: { codigo: true, clienteNombre: true } } },
  });
}

/** Lo que cada repartidor debería traer, para la pantalla de caja. */
export async function pendientesPorRepartidor() {
  const envios = await prisma.envio.findMany({
    where: { estado: 'ENTREGADO', rendicionId: null, montoCobrado: { gt: 0 } },
    select: { montoCobrado: true, repartidorId: true, fechaEntrega: true },
  });

  const porPersona = new Map<string, { total: number; entregas: number; desde: Date | null }>();
  for (const envio of envios) {
    if (!envio.repartidorId) continue;
    const actual = porPersona.get(envio.repartidorId) ?? { total: 0, entregas: 0, desde: null };
    actual.total += envio.montoCobrado ?? 0;
    actual.entregas += 1;
    if (envio.fechaEntrega && (!actual.desde || envio.fechaEntrega < actual.desde)) {
      actual.desde = envio.fechaEntrega;
    }
    porPersona.set(envio.repartidorId, actual);
  }
  return porPersona;
}
