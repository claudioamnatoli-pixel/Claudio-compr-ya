'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auditar } from '@/lib/auditoria';
import { generarNumeroCompra } from '@/lib/codigos';
import { TransicionInvalida, totalDeItems, transicionarCompra } from '@/lib/compras';
import { ESTADOS_COMPRA } from '@/lib/dominio';
import { autorizar } from '@/lib/guardias';
import { StockInsuficiente } from '@/lib/inventario';
import { prisma } from '@/lib/prisma';
import {
  exito,
  fallo,
  textoObligatorio,
  textoOpcional,
  validar,
  type ResultadoAccion,
} from '@/lib/acciones';

const esquemaCompra = z.object({
  proveedorId: textoObligatorio('Elegí el proveedor'),
  factura: textoOpcional(),
  notas: textoOpcional(),
});

/** Una línea por producto, enviada como productoId[], cantidad[], costo[]. */
function leerLineas(formData: FormData) {
  const productos = formData.getAll('productoId').map(String);
  const cantidades = formData.getAll('cantidad').map((v) => Number(v));
  const costos = formData.getAll('costoUnitario').map((v) => Number(v));

  const lineas: { productoId: string; cantidad: number; costoUnitario: number }[] = [];
  for (let i = 0; i < productos.length; i++) {
    const productoId = productos[i];
    const cantidad = Math.trunc(cantidades[i] ?? 0);
    const costoUnitario = Math.trunc(costos[i] ?? 0);
    // Una fila vacía no es un error: el formulario ofrece varias y se llenan
    // las que hagan falta.
    if (!productoId || cantidad <= 0) continue;
    lineas.push({ productoId, cantidad, costoUnitario });
  }
  return lineas;
}

export async function crearCompra(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('compras.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaCompra, formData);
  if (!resultado.ok) return fallo(resultado.error);

  const lineas = leerLineas(formData);
  if (lineas.length === 0) {
    return fallo('Agregá al menos un producto con su cantidad.');
  }
  if (lineas.some((l) => l.costoUnitario <= 0)) {
    return fallo('Cada producto tiene que llevar lo que se pagó por unidad.');
  }

  const proveedor = await prisma.proveedor.findUnique({
    where: { id: resultado.datos.proveedorId },
  });
  if (!proveedor) return fallo('Ese proveedor ya no existe.');

  const total = totalDeItems(lineas);
  const numero = await generarNumeroCompra();

  const compra = await prisma.compra.create({
    data: {
      ...resultado.datos,
      numero,
      total,
      empleadoId: guardia.usuario.id,
      items: {
        create: lineas.map((l) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          costoUnitario: l.costoUnitario,
          subtotal: l.cantidad * l.costoUnitario,
        })),
      },
    },
  });

  await auditar(prisma, {
    accion: 'compra.crear',
    entidad: 'Compra',
    entidadId: compra.id,
    resumen: `Compra ${numero} a ${proveedor.nombre} por ${total}`,
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/compras');
  return exito(`Compra ${numero} registrada como borrador.`, { id: compra.id });
}

const ACCION_POR_ESTADO: Record<string, string> = {
  RECIBIDA: 'compra.recibir',
  PAGADA: 'compra.pagar',
  ANULADA: 'compra.anular',
};

export async function moverCompra(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('compras.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const id = String(formData.get('id') ?? '');
  const nuevoEstado = String(formData.get('estado') ?? '');
  if (!ESTADOS_COMPRA.esValido(nuevoEstado)) return fallo('Ese estado no existe.');

  const compra = await prisma.compra.findUnique({
    where: { id },
    include: { proveedor: { select: { nombre: true } } },
  });
  if (!compra) return fallo('Esa compra ya no existe.');

  try {
    await prisma.$transaction((tx) =>
      transicionarCompra(tx, id, nuevoEstado, guardia.usuario.id),
    );
  } catch (error) {
    if (error instanceof TransicionInvalida || error instanceof StockInsuficiente) {
      return fallo(error.message);
    }
    throw error;
  }

  await auditar(prisma, {
    accion: ACCION_POR_ESTADO[nuevoEstado] ?? 'compra.actualizar',
    entidad: 'Compra',
    entidadId: id,
    resumen:
      `Compra ${compra.numero} a ${compra.proveedor.nombre}: ` +
      `${ESTADOS_COMPRA.etiqueta(nuevoEstado).toLowerCase()}`,
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/compras');
  revalidatePath('/inventario');
  return exito(`Compra ${ESTADOS_COMPRA.etiqueta(nuevoEstado).toLowerCase()}.`);
}
