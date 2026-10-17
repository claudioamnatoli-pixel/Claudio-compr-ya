import { COMPRAS_EN_FIRME, CATEGORIAS_GASTO } from './dominio';
import { prisma } from './prisma';

/**
 * El estado de resultados: lo que entró, lo que salió y lo que quedó.
 *
 * La regla que no se puede romper: **cada gasto se lee de su fuente natural y
 * nunca se copia a otra tabla**. Las comisiones viven en `Comision`, las
 * campañas en `Campana`, el costo de la mercadería en la línea del pedido y los
 * demás gastos en `Gasto`. Si alguno se cargara además como gasto suelto, se
 * contaría dos veces y el resultado mentiría sin que nadie supiera por qué.
 *
 * Se devuelven dos miradas distintas, porque responden preguntas distintas:
 *
 * - **Resultado**: de lo que vendiste, cuánto quedó. Usa el costo de la
 *   mercadería que efectivamente salió, no lo que gastaste reponiendo.
 * - **Caja**: cuánta plata entró y salió de verdad en el período. Un mes en que
 *   comprás mucho stock da caja negativa aunque el negocio vaya bien.
 *
 * Confundirlas es el error clásico: creer que se perdió plata porque se
 * repuso inventario, o creer que se ganó porque todavía no se repuso.
 */
export type EstadoDeResultados = Awaited<ReturnType<typeof estadoDeResultados>>;

export async function estadoDeResultados(desde: Date, hasta: Date) {
  const rango = { gte: desde, lte: hasta };

  const [entregados, comisiones, campanas, gastos, compras, enviosConCosto] =
    await Promise.all([
      // Ingresos y costo de la mercadería vendida: sólo pedidos entregados, que
      // son los únicos que de verdad se cobraron.
      prisma.pedido.findMany({
        where: { estado: 'ENTREGADO', updatedAt: rango },
        select: {
          descuento: true,
          costoEnvio: true,
          items: { select: { subtotal: true, cantidad: true, costoUnitario: true } },
        },
      }),
      prisma.comision.aggregate({
        where: { createdAt: rango },
        _sum: { monto: true },
      }),
      prisma.campana.aggregate({
        where: { fechaInicio: rango },
        _sum: { presupuesto: true },
      }),
      prisma.gasto.groupBy({
        by: ['categoria'],
        where: { fecha: rango },
        _sum: { monto: true },
      }),
      prisma.compra.aggregate({
        where: { estado: { in: [...COMPRAS_EN_FIRME] }, recibidaAt: rango },
        _sum: { total: true },
      }),
      prisma.envio.aggregate({
        where: { fechaEntrega: rango },
        _sum: { costoReal: true, montoCobrado: true },
      }),
    ]);

  const ventas = entregados.reduce(
    (suma, p) => suma + p.items.reduce((s, i) => s + i.subtotal, 0),
    0,
  );
  const descuentos = entregados.reduce((suma, p) => suma + p.descuento, 0);
  const enviosCobrados = entregados.reduce((suma, p) => suma + p.costoEnvio, 0);
  const mercaderiaVendida = entregados.reduce(
    (suma, p) => suma + p.items.reduce((s, i) => s + i.costoUnitario * i.cantidad, 0),
    0,
  );

  const totalComisiones = comisiones._sum.monto ?? 0;
  const totalCampanas = campanas._sum.presupuesto ?? 0;
  const costoEnvios = enviosConCosto._sum.costoReal ?? 0;
  const cobradoEnRuta = enviosConCosto._sum.montoCobrado ?? 0;
  const comprasRecibidas = compras._sum.total ?? 0;

  const porCategoria = CATEGORIAS_GASTO.valores
    .map((categoria) => ({
      categoria,
      etiqueta: CATEGORIAS_GASTO.etiqueta(categoria),
      monto: gastos.find((g) => g.categoria === categoria)?._sum.monto ?? 0,
    }))
    .filter((g) => g.monto > 0)
    .sort((a, b) => b.monto - a.monto);
  const totalGastos = porCategoria.reduce((suma, g) => suma + g.monto, 0);

  const ingresos = ventas - descuentos + enviosCobrados;
  const egresos = mercaderiaVendida + totalComisiones + totalCampanas + costoEnvios + totalGastos;
  const resultado = ingresos - egresos;

  return {
    desde,
    hasta,
    pedidos: entregados.length,
    ingresos: { ventas, descuentos, enviosCobrados, total: ingresos },
    egresos: {
      mercaderiaVendida,
      comisiones: totalComisiones,
      campanas: totalCampanas,
      envios: costoEnvios,
      gastos: totalGastos,
      porCategoria,
      total: egresos,
    },
    resultado,
    /// Margen sobre lo vendido. Null cuando no hubo ventas, para no dividir por
    /// cero ni mostrar un 0% que parece un resultado real.
    margen: ingresos > 0 ? resultado / ingresos : null,
    caja: {
      cobradoEnRuta,
      comprasRecibidas,
      /// Aproximación: lo cobrado en ruta menos lo que se pagó por reponer y
      /// los gastos del período. No incluye cobros por transferencia, que el
      /// sistema todavía no registra por separado.
      movimiento: cobradoEnRuta - comprasRecibidas - totalGastos,
    },
  };
}

/** Primer y último instante del mes que contiene a `fecha`. */
export function mesDe(fecha: Date): { desde: Date; hasta: Date } {
  const desde = new Date(fecha.getFullYear(), fecha.getMonth(), 1, 0, 0, 0, 0);
  const hasta = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59, 999);
  return { desde, hasta };
}
