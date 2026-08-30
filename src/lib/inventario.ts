import type { Prisma } from '@prisma/client';
import { MOVIMIENTOS_QUE_SUMAN } from './dominio';

/** Signo que un tipo de movimiento aplica al stock. */
export function signoDeMovimiento(tipo: string): 1 | -1 {
  return MOVIMIENTOS_QUE_SUMAN.has(tipo) ? 1 : -1;
}

export class StockInsuficiente extends Error {
  constructor(nombreProducto: string, disponible: number, solicitado: number) {
    super(
      `No hay stock suficiente de «${nombreProducto}»: quedan ${disponible} y se piden ${solicitado}.`,
    );
    this.name = 'StockInsuficiente';
  }
}

/**
 * Aplica un movimiento de inventario dentro de una transacción: ajusta el stock
 * del producto y deja el registro en el historial.
 *
 * Se hace siempre por aquí (nunca escribiendo `producto.stock` a mano) para que
 * el historial y las existencias no se puedan separar.
 */
export async function aplicarMovimiento(
  tx: Prisma.TransactionClient,
  datos: {
    productoId: string;
    tipo: string;
    cantidad: number;
    motivo?: string | null;
    referencia?: string | null;
    empleadoId?: string | null;
    /** Si es `false`, permite dejar el stock en negativo (útil en un ajuste). */
    validarExistencias?: boolean;
  },
) {
  const producto = await tx.producto.findUnique({
    where: { id: datos.productoId },
    select: { id: true, nombre: true, stock: true },
  });
  if (!producto) throw new Error('El producto ya no existe.');

  const cantidad = Math.abs(datos.cantidad);
  const delta = signoDeMovimiento(datos.tipo) * cantidad;
  const stockResultante = producto.stock + delta;

  if (datos.validarExistencias !== false && stockResultante < 0) {
    throw new StockInsuficiente(producto.nombre, producto.stock, cantidad);
  }

  await tx.producto.update({
    where: { id: producto.id },
    data: { stock: stockResultante },
  });

  return tx.movimientoInventario.create({
    data: {
      productoId: producto.id,
      tipo: datos.tipo,
      cantidad,
      stockResultante,
      motivo: datos.motivo ?? null,
      referencia: datos.referencia ?? null,
      empleadoId: datos.empleadoId ?? null,
    },
  });
}
