import type { Prisma } from '@prisma/client';
import { ESTADOS_PEDIDO, PEDIDOS_CERRADOS, TRANSICIONES_PEDIDO } from './dominio';
import { aplicarMovimiento } from './inventario';
import { periodoDe } from './formato';

/** Todo lo que hace falta cargar de un pedido para poder cambiarlo de estado. */
export const detallePedido = {
  items: true,
  vendedor: true,
  envio: true,
  comision: true,
} satisfies Prisma.PedidoInclude;

export type PedidoConDetalle = Prisma.PedidoGetPayload<{ include: typeof detallePedido }>;

export class TransicionInvalida extends Error {
  constructor(desde: string, hacia: string) {
    super(
      `Un pedido «${ESTADOS_PEDIDO.etiqueta(desde)}» no puede pasar a «${ESTADOS_PEDIDO.etiqueta(hacia)}».`,
    );
    this.name = 'TransicionInvalida';
  }
}

/** El estado del envío que corresponde a cada estado del pedido. */
const ENVIO_SEGUN_PEDIDO: Record<string, string | undefined> = {
  PREPARANDO: 'ASIGNADO',
  ENVIADO: 'EN_RUTA',
  ENTREGADO: 'ENTREGADO',
  DEVUELTO: 'DEVUELTO',
};

/**
 * Mueve un pedido de estado dentro de una transacción y arrastra todos sus
 * efectos: inventario, comisión y envío.
 *
 * Vive aquí, y no en el Server Action, porque logística también cambia el
 * estado de un pedido (al registrar una entrega) y las dos rutas tienen que
 * comportarse exactamente igual.
 */
export async function transicionarPedido(
  tx: Prisma.TransactionClient,
  pedido: PedidoConDetalle,
  nuevoEstado: string,
): Promise<void> {
  if (pedido.estado === nuevoEstado) return;

  const permitidos = TRANSICIONES_PEDIDO[pedido.estado] ?? [];
  if (!permitidos.includes(nuevoEstado)) {
    throw new TransicionInvalida(pedido.estado, nuevoEstado);
  }

  // ¿La mercancía ya salió del almacén? Se comprueba contra el historial, en
  // lugar de guardar una bandera aparte que podría quedar desincronizada.
  const salidasPrevias = await tx.movimientoInventario.count({
    where: { referencia: pedido.codigo, tipo: 'SALIDA' },
  });
  const yaDescontado = salidasPrevias > 0;

  const datos: Prisma.PedidoUpdateInput = { estado: nuevoEstado };
  if (nuevoEstado === 'CONFIRMADO' && !pedido.confirmadoAt) datos.confirmadoAt = new Date();
  if (PEDIDOS_CERRADOS.has(nuevoEstado)) datos.cerradoAt = new Date();
  await tx.pedido.update({ where: { id: pedido.id }, data: datos });

  if (nuevoEstado === 'CONFIRMADO' && !yaDescontado) {
    for (const item of pedido.items) {
      await aplicarMovimiento(tx, {
        productoId: item.productoId,
        tipo: 'SALIDA',
        cantidad: item.cantidad,
        motivo: 'Venta',
        referencia: pedido.codigo,
        empleadoId: pedido.vendedorId,
      });
    }

    if (pedido.vendedorId && pedido.vendedor && !pedido.comision) {
      const base = pedido.subtotal - pedido.descuento;
      await tx.comision.create({
        data: {
          empleadoId: pedido.vendedorId,
          pedidoId: pedido.id,
          base,
          porcentaje: pedido.vendedor.tasaComision,
          monto: Math.round(base * pedido.vendedor.tasaComision),
          estado: 'PENDIENTE',
          periodo: periodoDe(pedido.createdAt),
        },
      });
    }
  }

  const seDeshace = nuevoEstado === 'CANCELADO' || nuevoEstado === 'DEVUELTO';

  if (seDeshace && yaDescontado) {
    for (const item of pedido.items) {
      await aplicarMovimiento(tx, {
        productoId: item.productoId,
        tipo: 'DEVOLUCION',
        cantidad: item.cantidad,
        motivo: nuevoEstado === 'DEVUELTO' ? 'Pedido devuelto' : 'Pedido cancelado',
        referencia: pedido.codigo,
        empleadoId: pedido.vendedorId,
      });
    }
  }

  if (seDeshace) {
    // Una venta que no llegó a su destino no genera comisión. Las ya pagadas no
    // se tocan: eso se resuelve fuera del sistema, con la persona.
    await tx.comision.updateMany({
      where: { pedidoId: pedido.id, estado: { not: 'PAGADA' } },
      data: { estado: 'CANCELADA' },
    });
  }

  if (nuevoEstado === 'ENTREGADO') {
    await tx.comision.updateMany({
      where: { pedidoId: pedido.id, estado: 'PENDIENTE' },
      data: { estado: 'APROBADA' },
    });
  }

  const estadoEnvio = ENVIO_SEGUN_PEDIDO[nuevoEstado];
  if (pedido.envio && estadoEnvio && pedido.envio.estado !== estadoEnvio) {
    await tx.envio.update({
      where: { id: pedido.envio.id },
      data: {
        estado: estadoEnvio,
        ...(nuevoEstado === 'ENTREGADO'
          ? {
              fechaEntrega: pedido.envio.fechaEntrega ?? new Date(),
              intentos: Math.max(pedido.envio.intentos, 1),
              montoCobrado:
                pedido.metodoPago === 'CONTRA_ENTREGA'
                  ? (pedido.envio.montoCobrado ?? pedido.total)
                  : pedido.envio.montoCobrado,
            }
          : {}),
      },
    });
  }
}
