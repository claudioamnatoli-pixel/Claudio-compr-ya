import type { Prisma } from '@prisma/client';
import { COMPRAS_EN_FIRME, ESTADOS_COMPRA, TRANSICIONES_COMPRA } from './dominio';
import { aplicarMovimiento } from './inventario';

export class TransicionInvalida extends Error {
  constructor(desde: string, hacia: string) {
    super(
      `Una compra ${ESTADOS_COMPRA.etiqueta(desde).toLowerCase()} no puede pasar a ` +
        `${ESTADOS_COMPRA.etiqueta(hacia).toLowerCase()}.`,
    );
    this.name = 'TransicionInvalida';
  }
}

export function puedeTransicionar(desde: string, hacia: string): boolean {
  return (TRANSICIONES_COMPRA[desde] ?? []).includes(hacia);
}

/** Pasos que se le pueden ofrecer a una compra en pantalla. */
export function siguientesEstados(desde: string): readonly string[] {
  return TRANSICIONES_COMPRA[desde] ?? [];
}

/**
 * Mueve una compra de estado y aplica lo que ese paso implica.
 *
 * Es el equivalente de `transicionarPedido` para el lado del dinero que sale:
 * la mercadería entra al depósito al **recibir**, no al cargar el borrador, de
 * modo que una compra a medio escribir no infle el stock.
 *
 * Al recibir se actualiza además `Producto.costo` con lo que se pagó en esta
 * compra. Es el «último costo»: lo que vale reponer hoy, que es con lo que hay
 * que calcular el margen de aquí en adelante. El costo histórico no se pierde
 * —queda congelado en cada `ItemCompra`—, así que lo que ya se vendió se puede
 * seguir valuando a lo que realmente costó.
 */
export async function transicionarCompra(
  tx: Prisma.TransactionClient,
  compraId: string,
  nuevoEstado: string,
  empleadoId?: string | null,
) {
  const compra = await tx.compra.findUnique({
    where: { id: compraId },
    include: { items: { include: { producto: { select: { nombre: true } } } } },
  });
  if (!compra) throw new Error('La compra ya no existe.');
  if (!puedeTransicionar(compra.estado, nuevoEstado)) {
    throw new TransicionInvalida(compra.estado, nuevoEstado);
  }

  const entraAlDeposito =
    !COMPRAS_EN_FIRME.has(compra.estado) && COMPRAS_EN_FIRME.has(nuevoEstado);
  const saleDelDeposito =
    COMPRAS_EN_FIRME.has(compra.estado) && !COMPRAS_EN_FIRME.has(nuevoEstado);

  for (const item of compra.items) {
    if (entraAlDeposito) {
      await aplicarMovimiento(tx, {
        productoId: item.productoId,
        tipo: 'ENTRADA',
        cantidad: item.cantidad,
        motivo: `Compra ${compra.numero}`,
        referencia: compra.factura ?? compra.numero,
        empleadoId,
      });
      await tx.producto.update({
        where: { id: item.productoId },
        data: { costo: item.costoUnitario },
      });
    }
    if (saleDelDeposito) {
      // Anular una compra ya recibida devuelve la mercadería. Si no queda
      // stock porque ya se vendió, el movimiento falla a propósito: deshacer
      // una compra cuya mercadería se vendió dejaría el inventario mintiendo.
      await aplicarMovimiento(tx, {
        productoId: item.productoId,
        tipo: 'SALIDA',
        cantidad: item.cantidad,
        motivo: `Anulación de la compra ${compra.numero}`,
        referencia: compra.numero,
        empleadoId,
      });
    }
  }

  return tx.compra.update({
    where: { id: compra.id },
    data: {
      estado: nuevoEstado,
      recibidaAt: entraAlDeposito ? new Date() : compra.recibidaAt,
      pagadaAt: nuevoEstado === 'PAGADA' ? new Date() : compra.pagadaAt,
    },
  });
}

/** Suma de las líneas. El total nunca se escribe a mano. */
export function totalDeItems(
  items: readonly { cantidad: number; costoUnitario: number }[],
): number {
  return items.reduce((suma, i) => suma + i.cantidad * i.costoUnitario, 0);
}
