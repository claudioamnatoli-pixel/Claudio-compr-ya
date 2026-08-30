import { prisma } from './prisma';
import { PEDIDOS_VENDIDOS } from './dominio';

/** Lista de estados que cuentan como venta efectiva, para filtros de Prisma. */
export const ESTADOS_VENTA = Array.from(PEDIDOS_VENDIDOS);

export function inicioDelMes(fecha = new Date()) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

export function inicioDelDia(fecha = new Date()) {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

/** Indicadores de la portada. Un mes natural contra el anterior. */
export async function resumenDelNegocio() {
  const ahora = new Date();
  const desdeEsteMes = inicioDelMes(ahora);
  const desdeMesPasado = inicioDelMes(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1));

  const ventasDe = async (desde: Date, hasta?: Date) =>
    prisma.pedido.aggregate({
      where: {
        estado: { in: ESTADOS_VENTA },
        createdAt: { gte: desde, ...(hasta ? { lt: hasta } : {}) },
      },
      _sum: { total: true },
      _count: true,
    });

  const [esteMes, mesPasado, leadsMes, leadsGanadosMes, entregasPendientes, stockBajo] =
    await Promise.all([
      ventasDe(desdeEsteMes),
      ventasDe(desdeMesPasado, desdeEsteMes),
      prisma.lead.count({ where: { createdAt: { gte: desdeEsteMes } } }),
      prisma.lead.count({ where: { createdAt: { gte: desdeEsteMes }, estado: 'GANADO' } }),
      prisma.envio.count({ where: { estado: { in: ['POR_ASIGNAR', 'ASIGNADO', 'EN_RUTA'] } } }),
      prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM Producto WHERE activo = 1 AND stock <= stockMinimo
      `,
    ]);

  const ventasMes = esteMes._sum.total ?? 0;
  const ventasMesPasado = mesPasado._sum.total ?? 0;

  return {
    ventasMes,
    ventasMesPasado,
    /** Variación contra el mes anterior, como fracción. `null` si no hay base. */
    variacion: ventasMesPasado > 0 ? (ventasMes - ventasMesPasado) / ventasMesPasado : null,
    pedidosMes: esteMes._count,
    ticketPromedio: esteMes._count > 0 ? Math.round(ventasMes / esteMes._count) : 0,
    leadsMes,
    leadsGanadosMes,
    conversion: leadsMes > 0 ? leadsGanadosMes / leadsMes : 0,
    entregasPendientes,
    productosStockBajo: Number(stockBajo[0]?.total ?? 0),
  };
}

/** Conteo de prospectos por etapa del embudo. */
export async function embudoDeLeads() {
  const filas = await prisma.lead.groupBy({ by: ['estado'], _count: { _all: true } });
  return new Map(filas.map((fila) => [fila.estado, fila._count._all]));
}

/** Qué campaña de TikTok trajo prospectos y cuánta venta terminó generando. */
export async function rendimientoDeCampanas() {
  const campanas = await prisma.campana.findMany({
    include: {
      leads: {
        select: {
          estado: true,
          pedidos: { select: { total: true, estado: true } },
        },
      },
    },
    orderBy: { fechaInicio: 'desc' },
  });

  return campanas.map((campana) => {
    const leads = campana.leads.length;
    const ganados = campana.leads.filter((lead) => lead.estado === 'GANADO').length;
    const ingresos = campana.leads
      .flatMap((lead) => lead.pedidos)
      .filter((pedido) => PEDIDOS_VENDIDOS.has(pedido.estado))
      .reduce((suma, pedido) => suma + pedido.total, 0);

    return {
      id: campana.id,
      nombre: campana.nombre,
      tipo: campana.tipo,
      activa: campana.activa,
      fechaInicio: campana.fechaInicio,
      hashtags: campana.hashtags,
      urlVideo: campana.urlVideo,
      presupuesto: campana.presupuesto,
      leads,
      ganados,
      conversion: leads > 0 ? ganados / leads : 0,
      ingresos,
      /** Retorno sobre la inversión publicitaria. `null` si la campaña es orgánica. */
      retorno: campana.presupuesto > 0 ? ingresos / campana.presupuesto : null,
      costoPorLead: campana.presupuesto > 0 && leads > 0 ? Math.round(campana.presupuesto / leads) : null,
    };
  });
}

/** Ranking de vendedores del periodo indicado (AAAA-MM). */
export async function rendimientoDeVendedores(periodo: string) {
  const [anio, mes] = periodo.split('-').map(Number);
  const desde = new Date(anio, mes - 1, 1);
  const hasta = new Date(anio, mes, 1);

  const vendedores = await prisma.empleado.findMany({
    where: { rol: { in: ['VENDEDOR', 'LIDER'] }, activo: true },
    include: {
      equipo: { select: { nombre: true } },
      pedidos: {
        where: { createdAt: { gte: desde, lt: hasta } },
        select: { total: true, estado: true },
      },
      leads: {
        where: { createdAt: { gte: desde, lt: hasta } },
        select: { estado: true },
      },
      comisiones: { where: { periodo }, select: { monto: true, estado: true } },
    },
  });

  return vendedores
    .map((vendedor) => {
      const vendidos = vendedor.pedidos.filter((pedido) => PEDIDOS_VENDIDOS.has(pedido.estado));
      const ventas = vendidos.reduce((suma, pedido) => suma + pedido.total, 0);
      const ganados = vendedor.leads.filter((lead) => lead.estado === 'GANADO').length;
      const comisiones = vendedor.comisiones.reduce((suma, c) => suma + c.monto, 0);
      const comisionesPagadas = vendedor.comisiones
        .filter((c) => c.estado === 'PAGADA')
        .reduce((suma, c) => suma + c.monto, 0);

      return {
        id: vendedor.id,
        nombre: vendedor.nombre,
        rol: vendedor.rol,
        equipo: vendedor.equipo?.nombre ?? null,
        tasaComision: vendedor.tasaComision,
        metaMensual: vendedor.metaMensual,
        ventas,
        pedidos: vendidos.length,
        leads: vendedor.leads.length,
        ganados,
        conversion: vendedor.leads.length > 0 ? ganados / vendedor.leads.length : 0,
        comisiones,
        comisionesPagadas,
        avanceMeta: vendedor.metaMensual > 0 ? ventas / vendedor.metaMensual : null,
      };
    })
    .sort((a, b) => b.ventas - a.ventas);
}

/** Productos que ya tocaron su umbral mínimo. */
export async function productosConStockBajo(limite = 8) {
  return prisma.$queryRaw<
    { id: string; sku: string; nombre: string; stock: number; stockMinimo: number }[]
  >`
    SELECT id, sku, nombre, stock, stockMinimo
    FROM Producto
    WHERE activo = 1 AND stock <= stockMinimo
    ORDER BY (stock - stockMinimo) ASC, stock ASC
    LIMIT ${limite}
  `;
}

/** Productos más vendidos, por unidades, en pedidos que cuentan como venta. */
export async function productosMasVendidos(limite = 6) {
  const filas = await prisma.itemPedido.groupBy({
    by: ['productoId'],
    where: { pedido: { estado: { in: ESTADOS_VENTA } } },
    _sum: { cantidad: true, subtotal: true },
    orderBy: { _sum: { cantidad: 'desc' } },
    take: limite,
  });

  const productos = await prisma.producto.findMany({
    where: { id: { in: filas.map((fila) => fila.productoId) } },
    select: { id: true, nombre: true, sku: true, precio: true, costo: true },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  return filas.flatMap((fila) => {
    const producto = porId.get(fila.productoId);
    if (!producto) return [];
    const unidades = fila._sum.cantidad ?? 0;
    const ingresos = fila._sum.subtotal ?? 0;
    return [
      {
        ...producto,
        unidades,
        ingresos,
        /** Margen bruto estimado con el costo actual del producto. */
        margen: ingresos - producto.costo * unidades,
      },
    ];
  });
}
