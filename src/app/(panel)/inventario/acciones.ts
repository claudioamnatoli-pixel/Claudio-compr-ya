'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { TIPOS_MOVIMIENTO } from '@/lib/dominio';
import { aplicarMovimiento, StockInsuficiente } from '@/lib/inventario';
import { autorizar } from '@/lib/guardias';
import { prisma } from '@/lib/prisma';
import {
  dineroEnUnidadMinima,
  enteroNoNegativo,
  exito,
  fallo,
  textoObligatorio,
  textoOpcional,
  validar,
  type ResultadoAccion,
} from '@/lib/acciones';

const esquemaProducto = z.object({
  sku: textoObligatorio('El SKU es obligatorio'),
  nombre: textoObligatorio('El nombre es obligatorio'),
  categoria: textoObligatorio('La categoría es obligatoria'),
  descripcion: textoOpcional(),
  costo: dineroEnUnidadMinima('Escribe un costo válido'),
  precio: dineroEnUnidadMinima('Escribe un precio válido'),
  stockMinimo: enteroNoNegativo('El stock mínimo debe ser un número entero'),
  stockInicial: enteroNoNegativo('El stock inicial debe ser un número entero'),
});

export async function crearProducto(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('inventario.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaProducto, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { stockInicial, ...datos } = resultado.datos;

  if (datos.precio < datos.costo) {
    return fallo('El precio de venta es menor que el costo: revisa las cifras.');
  }

  const repetido = await prisma.producto.findUnique({ where: { sku: datos.sku } });
  if (repetido) return fallo(`Ya existe un producto con el SKU ${datos.sku}.`);

  const producto = await prisma.$transaction(async (tx) => {
    const creado = await tx.producto.create({ data: { ...datos, stock: 0 } });
    if (stockInicial > 0) {
      await aplicarMovimiento(tx, {
        productoId: creado.id,
        tipo: 'ENTRADA',
        cantidad: stockInicial,
        motivo: 'Alta del producto',
      });
    }
    return creado;
  });

  revalidatePath('/inventario');
  redirect(`/inventario/${producto.id}`);
}

const esquemaEdicion = z.object({
  productoId: textoObligatorio(),
  nombre: textoObligatorio('El nombre es obligatorio'),
  categoria: textoObligatorio('La categoría es obligatoria'),
  descripcion: textoOpcional(),
  costo: dineroEnUnidadMinima('Escribe un costo válido'),
  precio: dineroEnUnidadMinima('Escribe un precio válido'),
  stockMinimo: enteroNoNegativo('El stock mínimo debe ser un número entero'),
  activo: z.union([z.literal('on'), z.undefined()]).transform((valor) => valor === 'on'),
});

export async function actualizarProducto(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('inventario.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaEdicion, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { productoId, ...datos } = resultado.datos;

  if (datos.precio < datos.costo) {
    return fallo('El precio de venta es menor que el costo: revisa las cifras.');
  }

  await prisma.producto.update({ where: { id: productoId }, data: datos });
  revalidatePath(`/inventario/${productoId}`);
  revalidatePath('/inventario');
  return exito('Producto actualizado.');
}

const esquemaMovimiento = z.object({
  productoId: textoObligatorio(),
  tipo: z.string().refine(TIPOS_MOVIMIENTO.esValido, { message: 'Tipo de movimiento no válido' }),
  cantidad: enteroNoNegativo('La cantidad debe ser un número entero'),
  motivo: textoOpcional(),
  referencia: textoOpcional(),
  empleadoId: textoOpcional(),
});

export async function registrarMovimiento(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('inventario.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaMovimiento, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { productoId, tipo, cantidad, motivo, referencia, empleadoId } = resultado.datos;

  if (cantidad === 0) return fallo('La cantidad debe ser mayor que cero.');

  try {
    await prisma.$transaction((tx) =>
      aplicarMovimiento(tx, {
        productoId,
        tipo,
        cantidad,
        motivo,
        referencia,
        // Si no se indica a nadie, responde quien tiene la sesión abierta.
        empleadoId: empleadoId ?? guardia.usuario.id,
        // Un ajuste sirve justamente para corregir descuadres, así que no se valida.
        validarExistencias: tipo !== 'AJUSTE',
      }),
    );
  } catch (error) {
    if (error instanceof StockInsuficiente) return fallo(error.message);
    throw error;
  }

  revalidatePath(`/inventario/${productoId}`);
  revalidatePath('/inventario');
  revalidatePath('/');
  return exito('Movimiento registrado.');
}
