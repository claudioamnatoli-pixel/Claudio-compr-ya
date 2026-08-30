'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { generarCodigoPedido } from '@/lib/codigos';
import { auditar } from '@/lib/auditoria';
import { ESTADOS_PEDIDO, METODOS_PAGO } from '@/lib/dominio';
import { formatearDinero } from '@/lib/formato';
import { puede } from '@/lib/permisos';
import { StockInsuficiente } from '@/lib/inventario';
import { detallePedido, transicionarPedido, TransicionInvalida } from '@/lib/pedidos';
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

const esquemaPedido = z.object({
  clienteNombre: textoObligatorio('Escribe el nombre de quien recibe'),
  telefono: textoObligatorio('Escribe el teléfono de contacto'),
  direccion: textoObligatorio('La dirección de entrega es obligatoria'),
  ciudad: textoObligatorio('La ciudad es obligatoria'),
  referencia: textoOpcional(),
  metodoPago: z.string().refine(METODOS_PAGO.esValido, { message: 'Método de pago no válido' }),
  zonaId: textoOpcional(),
  vendedorId: textoOpcional(),
  leadId: textoOpcional(),
  descuento: dineroEnUnidadMinima('Escribe un descuento válido'),
  notas: textoOpcional(),
});

/**
 * Las líneas del pedido llegan como campos repetidos (`productoId` y
 * `cantidad`), que `Object.fromEntries` colapsaría. Por eso se leen aparte.
 */
function leerLineas(formData: FormData) {
  const productos = formData.getAll('productoId').map(String);
  const cantidades = formData.getAll('cantidad').map((valor) => Number(String(valor)));

  const porProducto = new Map<string, number>();
  productos.forEach((productoId, indice) => {
    const cantidad = cantidades[indice];
    if (!productoId || !Number.isInteger(cantidad) || cantidad <= 0) return;
    // Si alguien añade dos veces el mismo producto, se suman las cantidades en
    // lugar de fallar contra la restricción única (pedidoId, productoId).
    porProducto.set(productoId, (porProducto.get(productoId) ?? 0) + cantidad);
  });

  return [...porProducto.entries()].map(([productoId, cantidad]) => ({ productoId, cantidad }));
}

export async function crearPedido(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('pedidos.crear');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaPedido, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const datos = resultado.datos;

  const lineas = leerLineas(formData);
  if (lineas.length === 0) return fallo('Agrega al menos un producto al pedido.');

  const productos = await prisma.producto.findMany({
    where: { id: { in: lineas.map((linea) => linea.productoId) } },
    select: { id: true, nombre: true, precio: true, stock: true },
  });
  const porId = new Map(productos.map((producto) => [producto.id, producto]));

  const items: { productoId: string; cantidad: number; precioUnitario: number; subtotal: number }[] = [];
  for (const linea of lineas) {
    const producto = porId.get(linea.productoId);
    if (!producto) return fallo('Uno de los productos seleccionados ya no existe.');
    if (producto.stock < linea.cantidad) {
      return fallo(
        `No hay stock suficiente de «${producto.nombre}»: quedan ${producto.stock} y se piden ${linea.cantidad}.`,
      );
    }
    items.push({
      productoId: producto.id,
      cantidad: linea.cantidad,
      precioUnitario: producto.precio,
      subtotal: producto.precio * linea.cantidad,
    });
  }

  const zona = datos.zonaId
    ? await prisma.zona.findUnique({ where: { id: datos.zonaId } })
    : null;

  const subtotal = items.reduce((suma, item) => suma + item.subtotal, 0);
  const costoEnvio = zona?.costoEnvio ?? 0;
  if (datos.descuento > subtotal) {
    return fallo('El descuento no puede ser mayor que el subtotal del pedido.');
  }
  const total = subtotal - datos.descuento + costoEnvio;

  // Quien no gestiona personal no puede atribuirle la venta —y la comisión— a
  // otra persona: el pedido queda a su nombre.
  const vendedorId = puede(guardia.usuario.rol, 'equipo.ver')
    ? datos.vendedorId
    : guardia.usuario.id;

  const codigo = await generarCodigoPedido();
  const pedido = await prisma.$transaction(async (tx) => {
    const creado = await tx.pedido.create({
      data: {
        codigo,
        clienteNombre: datos.clienteNombre,
        telefono: datos.telefono,
        direccion: datos.direccion,
        ciudad: datos.ciudad,
        referencia: datos.referencia,
        metodoPago: datos.metodoPago,
        notas: datos.notas,
        leadId: datos.leadId,
        vendedorId,
        subtotal,
        descuento: datos.descuento,
        costoEnvio,
        total,
        items: { create: items },
      },
    });

    // Todo pedido nace con su envío, aunque todavía no tenga repartidor.
    await tx.envio.create({
      data: {
        pedidoId: creado.id,
        zonaId: zona?.id ?? null,
        estado: 'POR_ASIGNAR',
        fechaProgramada: zona
          ? new Date(Date.now() + zona.horasEstimadas * 60 * 60 * 1000)
          : null,
      },
    });

    // El prospecto que se convierte en pedido pasa a estar ganado.
    if (datos.leadId) {
      await tx.lead.update({
        where: { id: datos.leadId },
        data: { estado: 'GANADO', motivoPerdida: null, ultimoContactoAt: new Date() },
      });
    }

    return creado;
  });

  revalidatePath('/pedidos');
  revalidatePath('/logistica');
  revalidatePath('/');
  if (datos.leadId) revalidatePath(`/leads/${datos.leadId}`);
  redirect(`/pedidos/${pedido.id}`);
}

const esquemaEstado = z.object({
  pedidoId: textoObligatorio(),
  estado: z.string().refine(ESTADOS_PEDIDO.esValido, { message: 'Estado no válido' }),
});

/**
 * Mueve el pedido de estado y arrastra todo lo que eso implica: el inventario
 * sale al confirmar y vuelve si se cancela o se devuelve, la comisión del
 * vendedor se crea, se aprueba o se anula, y el envío se sincroniza.
 */
/**
 * Mueve el pedido de estado. Los efectos (inventario, comisión y envío) están
 * en `transicionarPedido`, que también usa logística.
 */
export async function cambiarEstadoPedido(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('pedidos.avanzar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaEstado, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { pedidoId, estado: nuevoEstado } = resultado.datos;

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: detallePedido,
  });
  if (!pedido) return fallo('El pedido ya no existe.');
  if (pedido.estado === nuevoEstado) return exito('El pedido ya estaba en ese estado.');

  try {
    await prisma.$transaction(async (tx) => {
      await transicionarPedido(tx, pedido, nuevoEstado);
      // Anular una venta hecha destruye ingresos y comisiones: queda registrado.
      if (nuevoEstado === 'CANCELADO' || nuevoEstado === 'DEVUELTO') {
        await auditar(tx, {
          accion: 'pedido.anular',
          entidad: 'Pedido',
          entidadId: pedido.id,
          resumen: `Pedido ${pedido.codigo} de ${formatearDinero(pedido.total)} marcado como ${ESTADOS_PEDIDO.etiqueta(nuevoEstado).toLowerCase()}`,
          actor: guardia.usuario,
        });
      }
    });
  } catch (error) {
    if (error instanceof TransicionInvalida || error instanceof StockInsuficiente) {
      return fallo(error.message);
    }
    throw error;
  }

  revalidatePath(`/pedidos/${pedido.id}`);
  revalidatePath('/pedidos');
  revalidatePath('/logistica');
  revalidatePath('/inventario');
  revalidatePath('/equipo');
  revalidatePath('/');
  return exito(`Pedido marcado como ${ESTADOS_PEDIDO.etiqueta(nuevoEstado).toLowerCase()}.`);
}

const esquemaNotas = z.object({
  pedidoId: textoObligatorio(),
  notas: textoOpcional(),
  referencia: textoOpcional(),
});

export async function actualizarNotasPedido(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('pedidos.avanzar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaNotas, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { pedidoId, notas, referencia } = resultado.datos;

  await prisma.pedido.update({ where: { id: pedidoId }, data: { notas, referencia } });
  revalidatePath(`/pedidos/${pedidoId}`);
  return exito('Datos guardados.');
}
