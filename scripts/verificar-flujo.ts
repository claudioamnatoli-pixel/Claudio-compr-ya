/**
 * Prueba del flujo completo de un pedido contra la base real: inventario,
 * comisión y envío. Deja la base como la encontró.
 */
import { PrismaClient } from '@prisma/client';
import { detallePedido, transicionarPedido, TransicionInvalida } from '../src/lib/pedidos';
import { aplicarMovimiento, StockInsuficiente } from '../src/lib/inventario';

const prisma = new PrismaClient();
let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = '') {
  console.log(`${condicion ? '  ok  ' : ' FALLA'} ${descripcion}${detalle ? ` — ${detalle}` : ''}`);
  if (!condicion) fallos += 1;
}

const recargar = (id: string) =>
  prisma.pedido.findUniqueOrThrow({ where: { id }, include: detallePedido });

const stockDe = async (id: string) =>
  (await prisma.producto.findUniqueOrThrow({ where: { id } })).stock;

/** Recarga el pedido y lo mueve al estado indicado, como hace el Server Action. */
async function mover(pedidoId: string, estado: string) {
  const actual = await recargar(pedidoId);
  await prisma.$transaction((tx) => transicionarPedido(tx, actual, estado));
}

async function main() {
  const marca = Date.now();
  const producto = await prisma.producto.create({
    data: { sku: `TEST-${marca}`, nombre: 'Producto de prueba', categoria: 'Prueba', costo: 10_00, precio: 100_00, stock: 10 },
  });
  const vendedor = await prisma.empleado.create({
    data: { nombre: 'Vendedor de prueba', email: `prueba-${marca}@test.mx`, telefono: '5500000000', rol: 'VENDEDOR', tasaComision: 0.1 },
  });
  const pedido = await prisma.pedido.create({
    data: {
      codigo: `TEST-${marca}`, clienteNombre: 'Cliente', telefono: '5500000001',
      direccion: 'Calle 1', ciudad: 'CDMX', metodoPago: 'CONTRA_ENTREGA', vendedorId: vendedor.id,
      subtotal: 300_00, descuento: 50_00, costoEnvio: 49_00, total: 299_00,
      items: { create: [{ productoId: producto.id, cantidad: 3, precioUnitario: 100_00, subtotal: 300_00 }] },
      envio: { create: { estado: 'POR_ASIGNAR' } },
    },
  });

  console.log('\nTransiciones no permitidas');
  try {
    await mover(pedido.id, 'ENTREGADO');
    comprobar('un pedido pendiente no puede pasar directo a entregado', false);
  } catch (error) {
    comprobar('un pedido pendiente no puede pasar directo a entregado', error instanceof TransicionInvalida);
  }
  comprobar('el stock no se tocó en la transición rechazada', (await stockDe(producto.id)) === 10);

  console.log('\nConfirmar el pedido');
  await mover(pedido.id, 'CONFIRMADO');
  comprobar('el stock baja de 10 a 7', (await stockDe(producto.id)) === 7, `stock=${await stockDe(producto.id)}`);
  const comision = await prisma.comision.findUniqueOrThrow({ where: { pedidoId: pedido.id } });
  comprobar('la comisión se calcula sobre subtotal − descuento', comision.base === 250_00 && comision.monto === 25_00, `base=${comision.base} monto=${comision.monto}`);
  comprobar('la comisión nace pendiente', comision.estado === 'PENDIENTE');
  comprobar('queda sellada la fecha de confirmación', (await recargar(pedido.id)).confirmadoAt !== null);

  console.log('\nHasta la entrega');
  await mover(pedido.id, 'PREPARANDO');
  await mover(pedido.id, 'ENVIADO');
  comprobar('el envío pasa a en ruta', (await recargar(pedido.id)).envio?.estado === 'EN_RUTA');
  await mover(pedido.id, 'ENTREGADO');
  const entregado = await recargar(pedido.id);
  comprobar('el envío queda entregado', entregado.envio?.estado === 'ENTREGADO');
  comprobar('se registra el cobro contra entrega', entregado.envio?.montoCobrado === 299_00, `cobrado=${entregado.envio?.montoCobrado}`);
  comprobar('la comisión pasa a aprobada', entregado.comision?.estado === 'APROBADA');
  comprobar('el stock sigue en 7 tras entregar', (await stockDe(producto.id)) === 7);

  console.log('\nDevolución');
  await mover(pedido.id, 'DEVUELTO');
  comprobar('el stock vuelve a 10', (await stockDe(producto.id)) === 10, `stock=${await stockDe(producto.id)}`);
  comprobar('la comisión se anula', (await recargar(pedido.id)).comision?.estado === 'CANCELADA');
  comprobar('el pedido queda cerrado', (await recargar(pedido.id)).cerradoAt !== null);

  console.log('\nCancelación después de confirmar');
  const pedido2 = await prisma.pedido.create({
    data: {
      codigo: `TEST2-${marca}`, clienteNombre: 'Cliente', telefono: '5500000002',
      direccion: 'Calle 2', ciudad: 'CDMX', vendedorId: vendedor.id,
      subtotal: 100_00, costoEnvio: 0, total: 100_00,
      items: { create: [{ productoId: producto.id, cantidad: 1, precioUnitario: 100_00, subtotal: 100_00 }] },
      envio: { create: { estado: 'POR_ASIGNAR' } },
    },
  });
  await mover(pedido2.id, 'CONFIRMADO');
  comprobar('confirmar descuenta una unidad', (await stockDe(producto.id)) === 9);
  await mover(pedido2.id, 'CANCELADO');
  comprobar('cancelar devuelve el stock', (await stockDe(producto.id)) === 10, `stock=${await stockDe(producto.id)}`);

  console.log('\nStock insuficiente');
  try {
    await prisma.$transaction((tx) =>
      aplicarMovimiento(tx, { productoId: producto.id, tipo: 'SALIDA', cantidad: 999 }),
    );
    comprobar('una salida mayor al stock se rechaza', false);
  } catch (error) {
    comprobar('una salida mayor al stock se rechaza', error instanceof StockInsuficiente);
  }
  comprobar('el stock no cambió tras el rechazo', (await stockDe(producto.id)) === 10);

  console.log('\nCoherencia del historial');
  const movimientos = await prisma.movimientoInventario.findMany({ where: { productoId: producto.id } });
  const calculado = movimientos.reduce(
    (suma, m) => suma + (['ENTRADA', 'DEVOLUCION'].includes(m.tipo) ? m.cantidad : -m.cantidad),
    10, // el producto se creó con stock 10 sin movimiento asociado
  );
  comprobar('movimientos y stock coinciden', calculado === (await stockDe(producto.id)), `calculado=${calculado}`);

  // Limpieza: la base queda como estaba antes de la prueba.
  await prisma.comision.deleteMany({ where: { empleadoId: vendedor.id } });
  await prisma.envio.deleteMany({ where: { pedidoId: { in: [pedido.id, pedido2.id] } } });
  await prisma.itemPedido.deleteMany({ where: { pedidoId: { in: [pedido.id, pedido2.id] } } });
  await prisma.pedido.deleteMany({ where: { id: { in: [pedido.id, pedido2.id] } } });
  await prisma.movimientoInventario.deleteMany({ where: { productoId: producto.id } });
  await prisma.producto.delete({ where: { id: producto.id } });
  await prisma.empleado.delete({ where: { id: vendedor.id } });

  console.log(`\n${fallos === 0 ? 'Todas las comprobaciones pasaron.' : `${fallos} comprobación(es) fallaron.`}`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
