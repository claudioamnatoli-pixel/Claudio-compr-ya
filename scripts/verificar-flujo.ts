/**
 * Verificación del comportamiento que no se puede comprobar a ojo: el ciclo de
 * vida de un pedido contra la base real, el manejo del dinero, los permisos por
 * rol y las contraseñas. Deja la base como la encontró.
 */
import { PrismaClient } from '@prisma/client';
import { detallePedido, transicionarPedido, TransicionInvalida } from '../src/lib/pedidos';
import { aplicarMovimiento, StockInsuficiente } from '../src/lib/inventario';
import {
  generarPasswordProvisional,
  hashearPassword,
  revisarPassword,
  verificarPassword,
} from '../src/lib/password';
import { compararCampos, leerCambios } from '../src/lib/auditoria';
import { inicioDe, puede } from '../src/lib/permisos';
import { aUnidadMinima, formatearDinero } from '../src/lib/formato';
import { CONFIG, FACTOR_MONEDA } from '../src/lib/config';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

  console.log('\nDinero');
  comprobar(
    'el guaraní se detecta como moneda sin decimales',
    CONFIG.moneda !== 'PYG' || CONFIG.decimales === 0,
    `${CONFIG.moneda} → ${CONFIG.decimales} decimales`,
  );
  comprobar(
    'el factor de la moneda concuerda con sus decimales',
    FACTOR_MONEDA === 10 ** CONFIG.decimales,
    `factor=${FACTOR_MONEDA}`,
  );
  comprobar(
    'lo que se escribe en el formulario se guarda sin perder valor',
    aUnidadMinima('250000') === 250_000 * FACTOR_MONEDA,
    `aUnidadMinima("250000")=${aUnidadMinima('250000')}`,
  );
  comprobar(
    'guardar y formatear conserva la cifra',
    formatearDinero(aUnidadMinima('250000')).includes('250'),
    formatearDinero(aUnidadMinima('250000')),
  );
  comprobar(
    'los importes se guardan como enteros',
    Number.isInteger(aUnidadMinima('1234.56')),
    `${aUnidadMinima('1234.56')}`,
  );

  console.log('\nPermisos por rol');
  comprobar('administración puede gestionar personal', puede('ADMIN', 'equipo.gestionar'));
  comprobar('un vendedor NO puede gestionar personal', !puede('VENDEDOR', 'equipo.gestionar'));
  comprobar('un vendedor NO ve sueldos ajenos', !puede('VENDEDOR', 'equipo.verRemuneracion'));
  comprobar('un vendedor NO ve prospectos ajenos', !puede('VENDEDOR', 'leads.verTodos'));
  comprobar('un líder SÍ ve los prospectos del equipo', puede('LIDER', 'leads.verTodos'));
  comprobar('un líder NO da de alta personal', !puede('LIDER', 'equipo.gestionar'));
  comprobar('un repartidor NO entra al panel de ventas', !puede('REPARTIDOR', 'panel.ver'));
  comprobar('un repartidor NO toca el inventario', !puede('REPARTIDOR', 'inventario.gestionar'));
  comprobar('almacén NO ve el panel de ventas', !puede('ALMACEN', 'panel.ver'));
  comprobar('almacén SÍ mueve inventario', puede('ALMACEN', 'inventario.gestionar'));
  comprobar('un rol desconocido no puede nada', !puede('CUALQUIERA', 'panel.ver'));
  comprobar('sin rol no se puede nada', !puede(null, 'pedidos.ver'));
  comprobar('a cada rol se le manda a su inicio', inicioDe('REPARTIDOR') === '/logistica' && inicioDe('ALMACEN') === '/inventario');
  comprobar('sólo administración reparte contraseñas', puede('ADMIN', 'acceso.gestionar') && !puede('LIDER', 'acceso.gestionar'));
  comprobar('sólo administración lee la auditoría', puede('ADMIN', 'auditoria.ver') && !puede('LIDER', 'auditoria.ver'));

  console.log('\nContraseñas');
  const hash = hashearPassword('demo1234');
  comprobar('la contraseña correcta se acepta', verificarPassword('demo1234', hash));
  comprobar('una contraseña equivocada se rechaza', !verificarPassword('demo1235', hash));
  comprobar('un hash vacío se rechaza', !verificarPassword('demo1234', null));
  comprobar('dos hashes de la misma clave son distintos (sal propia)', hashearPassword('demo1234') !== hash);
  comprobar('se rechaza una contraseña corta', revisarPassword('abc1') !== null);
  comprobar('se rechaza una contraseña sin números', revisarPassword('solamenteletras') !== null);
  comprobar('se acepta una contraseña válida', revisarPassword('demo1234') === null);

  // La contraseña provisional se genera sola, así que tiene que cumplir siempre
  // las reglas: si una de cada mil no las cumpliera, fallaría al azar.
  const provisionales = Array.from({ length: 500 }, () => generarPasswordProvisional());
  comprobar(
    'las 500 contraseñas provisionales generadas cumplen las reglas',
    provisionales.every((p) => revisarPassword(p) === null),
    provisionales.find((p) => revisarPassword(p) !== null) ?? provisionales[0],
  );
  comprobar(
    'no se repiten entre sí',
    new Set(provisionales).size > 490,
    `${new Set(provisionales).size} distintas de 500`,
  );

  console.log('\nAuditoría');
  const antes = { salarioBase: 2_900_000, tasaComision: 0.06, nombre: 'Ana', activo: true };
  comprobar(
    'no se registra nada si no cambió nada',
    compararCampos(antes, { salarioBase: 2_900_000, nombre: 'Ana' }, [
      'salarioBase',
      'nombre',
    ]) === null,
  );
  const diferencias = compararCampos(antes, { salarioBase: 3_200_000, nombre: 'Ana' }, [
    'salarioBase',
    'nombre',
    'activo',
  ]);
  comprobar('se detecta el campo que cambió', diferencias?.salarioBase?.despues === 3_200_000);
  comprobar('no se anotan los campos que no cambiaron', diferencias !== null && !('nombre' in diferencias));
  comprobar(
    'un campo ausente no se inventa como cambio',
    diferencias !== null && !('activo' in diferencias),
  );
  comprobar(
    'se conserva el valor anterior, que es lo que da sentido al registro',
    diferencias?.salarioBase?.antes === 2_900_000,
  );
  comprobar(
    'un false que pasa a true se detecta (no se confunde con vacío)',
    compararCampos({ activo: false }, { activo: true }, ['activo'])?.activo?.despues === true,
  );
  comprobar('un JSON de cambios corrupto no rompe la lectura', leerCambios('{roto') === null);
  comprobar('sin cambios guardados se devuelve null', leerCambios(null) === null);

  const registradas = await prisma.auditoria.count();
  comprobar('el registro de auditoría tiene entradas', registradas > 0, `${registradas} entradas`);

  console.log('\nGuardas en los Server Actions');
  // Comprobación estructural: cada acción del panel tiene que empezar
  // autorizando. Ocultar un botón no protege nada, porque la petición se puede
  // enviar a mano; esta prueba evita que una acción nueva se quede sin guarda.
  const raizPanel = join(process.cwd(), 'src/app/(panel)');
  const archivosDeAcciones = readdirSync(raizPanel, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => join(raizPanel, entrada.name, 'acciones.ts'));

  let accionesRevisadas = 0;
  const sinGuarda: string[] = [];
  for (const archivo of archivosDeAcciones) {
    let contenido: string;
    try {
      contenido = readFileSync(archivo, 'utf8');
    } catch {
      continue; // El módulo no tiene acciones.
    }
    for (const coincidencia of contenido.matchAll(/export async function (\w+)\(/g)) {
      const nombre = coincidencia[1];
      const cuerpo = contenido.slice(coincidencia.index, contenido.indexOf('\n}', coincidencia.index));
      accionesRevisadas += 1;
      if (!cuerpo.includes('await autorizar(')) {
        sinGuarda.push(`${archivo.split('(panel)/')[1]} → ${nombre}`);
      }
    }
  }
  comprobar(
    `las ${accionesRevisadas} acciones del panel comprueban permisos`,
    sinGuarda.length === 0 && accionesRevisadas > 0,
    sinGuarda.length > 0 ? `sin guarda: ${sinGuarda.join(', ')}` : '',
  );

  // Las acciones que tocan dinero o accesos tienen que dejar rastro.
  const debenAuditar: Record<string, string[]> = {
    'equipo/acciones.ts': [
      'crearEmpleado',
      'actualizarEmpleado',
      'pagarComisiones',
      'crearEquipo',
      'otorgarAcceso',
      'revocarAcceso',
    ],
    'inventario/acciones.ts': ['crearProducto', 'actualizarProducto'],
    'pedidos/acciones.ts': ['cambiarEstadoPedido'],
  };
  const sinAuditar: string[] = [];
  for (const [archivo, funciones] of Object.entries(debenAuditar)) {
    const contenido = readFileSync(join(raizPanel, archivo), 'utf8');
    for (const nombre of funciones) {
      const inicio = contenido.indexOf(`export async function ${nombre}(`);
      const cuerpo = contenido.slice(inicio, contenido.indexOf('\n}', inicio));
      if (inicio === -1 || !cuerpo.includes('auditar(')) sinAuditar.push(`${archivo} → ${nombre}`);
    }
  }
  comprobar(
    'las acciones que tocan dinero o accesos dejan rastro en la auditoría',
    sinAuditar.length === 0,
    sinAuditar.length > 0 ? `sin auditar: ${sinAuditar.join(', ')}` : '',
  );

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
