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

/**
 * Alta de muchos productos con su stock inicial, en una sola pasada.
 *
 * Existe porque la regla del proyecto —el stock nunca se escribe a mano— no se
 * puede cumplir a razón de una ida y vuelta por producto cuando son miles: un
 * catálogo de 3.000 tardaría minutos. Esta función vive en el mismo módulo que
 * `aplicarMovimiento` justamente para que la regla siga teniendo un solo
 * dueño: escribe las existencias y su historial juntas, en la misma
 * transacción, igual que la versión de a una.
 *
 * Sólo sirve para dar de alta. Mover el stock de un producto que ya existe
 * sigue pasando por `aplicarMovimiento`, que es la que sabe validar
 * existencias.
 */
export async function crearProductosConStock(
  tx: Prisma.TransactionClient,
  productos: readonly {
    sku: string;
    nombre: string;
    categoria: string;
    descripcion?: string | null;
    costo: number;
    precio: number;
    stock: number;
    stockMinimo: number;
  }[],
  datos: { motivo: string; referencia?: string | null; empleadoId?: string | null },
) {
  if (productos.length === 0) return [];

  await tx.producto.createMany({
    data: productos.map((p) => ({
      sku: p.sku,
      nombre: p.nombre,
      categoria: p.categoria,
      descripcion: p.descripcion ?? null,
      costo: p.costo,
      precio: p.precio,
      stock: p.stock,
      stockMinimo: p.stockMinimo,
    })),
  });

  // Se releen para conocer los identificadores que acaba de asignar la base.
  const creados = await tx.producto.findMany({
    where: { sku: { in: productos.map((p) => p.sku) } },
    select: { id: true, sku: true, stock: true },
  });

  const conStock = creados.filter((p) => p.stock > 0);
  if (conStock.length > 0) {
    await tx.movimientoInventario.createMany({
      data: conStock.map((p) => ({
        productoId: p.id,
        tipo: 'ENTRADA',
        cantidad: p.stock,
        stockResultante: p.stock,
        motivo: datos.motivo,
        referencia: datos.referencia ?? null,
        empleadoId: datos.empleadoId ?? null,
      })),
    });
  }

  return creados;
}
