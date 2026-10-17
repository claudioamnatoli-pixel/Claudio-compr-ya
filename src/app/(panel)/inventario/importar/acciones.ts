'use server';

import { revalidatePath } from 'next/cache';
import { auditar } from '@/lib/auditoria';
import { autorizar } from '@/lib/guardias';
import { leerPlanilla } from '@/lib/importar';
import { crearProductosConStock } from '@/lib/inventario';
import { prisma } from '@/lib/prisma';
import { exito, fallo, type ResultadoAccion } from '@/lib/acciones';

/** Cuántos productos se crean por tanda, para no abrir una transacción eterna. */
const TANDA = 200;

/**
 * Carga un catálogo pegado desde una planilla.
 *
 * Dos decisiones que conviene no deshacer:
 *
 * - **O entra todo o no entra nada.** Si una sola línea está mal, no se
 *   escribe ninguna y se devuelve la lista de qué corregir. Una carga a medias
 *   de tres mil productos es imposible de desenredar después.
 * - **No toca el stock de lo que ya existe.** Un producto repetido actualiza
 *   nombre, categoría y precios; su stock sigue donde estaba. Cambiar
 *   existencias es trabajo de una compra o de un movimiento, que son los que
 *   dejan historial. Una planilla no puede reescribir el inventario en
 *   silencio.
 */
export async function importarCatalogo(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('inventario.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const pegado = String(formData.get('planilla') ?? '');
  if (pegado.trim() === '') return fallo('Pegá la planilla en el recuadro.');

  const { filas, errores } = leerPlanilla(pegado);

  if (errores.length > 0) {
    const muestra = errores
      .slice(0, 8)
      .map((e) => `Línea ${e.linea}: ${e.motivo}`)
      .join(' · ');
    const resto = errores.length > 8 ? ` …y ${errores.length - 8} más.` : '';
    return fallo(`No se cargó nada. Hay ${errores.length} líneas con problemas. ${muestra}${resto}`);
  }
  if (filas.length === 0) return fallo('No encontré ningún producto en lo que pegaste.');

  const existentes = await prisma.producto.findMany({
    where: { sku: { in: filas.map((f) => f.sku) } },
    select: { id: true, sku: true },
  });
  const yaEstan = new Map(existentes.map((p) => [p.sku, p.id]));

  const nuevos = filas.filter((f) => !yaEstan.has(f.sku));
  const actualizar = filas.filter((f) => yaEstan.has(f.sku));
  const referencia = `Carga masiva del ${new Date().toISOString().slice(0, 10)}`;

  for (let i = 0; i < nuevos.length; i += TANDA) {
    const tanda = nuevos.slice(i, i + TANDA);
    await prisma.$transaction((tx) =>
      crearProductosConStock(tx, tanda, {
        motivo: 'Carga inicial del catálogo',
        referencia,
        empleadoId: guardia.usuario.id,
      }),
    );
  }

  for (let i = 0; i < actualizar.length; i += TANDA) {
    const tanda = actualizar.slice(i, i + TANDA);
    await prisma.$transaction(
      tanda.map((f) =>
        prisma.producto.update({
          where: { id: yaEstan.get(f.sku) },
          // El stock no está acá a propósito: ver el comentario de arriba.
          data: {
            nombre: f.nombre,
            categoria: f.categoria,
            costo: f.costo,
            precio: f.precio,
            stockMinimo: f.stockMinimo,
          },
        }),
      ),
    );
  }

  await auditar(prisma, {
    accion: 'producto.importar',
    entidad: 'Producto',
    resumen: `Carga masiva: ${nuevos.length} productos nuevos y ${actualizar.length} actualizados`,
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/inventario');
  return exito(
    `Listo: ${nuevos.length} productos nuevos` +
      (actualizar.length > 0
        ? ` y ${actualizar.length} actualizados (a los repetidos no se les tocó el stock).`
        : '.'),
  );
}
