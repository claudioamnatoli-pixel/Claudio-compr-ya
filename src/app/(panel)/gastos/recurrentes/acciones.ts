'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auditar, compararCampos } from '@/lib/auditoria';
import { CATEGORIAS_FUERA_DE_RECURRENTE, CATEGORIAS_GASTO } from '@/lib/dominio';
import { formatearPeriodo } from '@/lib/formato';
import { autorizar } from '@/lib/guardias';
import { prisma } from '@/lib/prisma';
import { generarPeriodo } from '@/lib/recurrentes';
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

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

const esquemaRecurrente = z.object({
  categoria: textoObligatorio('Elegí la categoría'),
  descripcion: textoObligatorio('Escribí de qué es el gasto'),
  monto: dineroEnUnidadMinima('Escribí un importe válido'),
  diaDePago: enteroNoNegativo('El día de pago tiene que ser un número'),
  desde: textoObligatorio('Elegí desde qué mes corre'),
  hasta: textoOpcional(),
  proveedorId: textoOpcional(),
  notas: textoOpcional(),
});

/** "2026-10" desde un `<input type="month">`. */
function revisarPeriodo(valor: string): boolean {
  return PERIODO.test(valor);
}

function revisarComun(datos: {
  categoria: string;
  monto: number;
  diaDePago: number;
  desde: string;
  hasta: string | null;
}): string | null {
  if (!CATEGORIAS_GASTO.esValido(datos.categoria)) return 'Esa categoría no existe.';
  if (CATEGORIAS_FUERA_DE_RECURRENTE.includes(datos.categoria as 'SUELDOS')) {
    return 'Los sueldos no se cargan acá: se calculan de la nómina del equipo.';
  }
  if (datos.monto <= 0) return 'El importe tiene que ser mayor que cero.';
  if (datos.diaDePago < 1 || datos.diaDePago > 28) {
    return 'El día de pago va de 1 a 28, para que exista también en febrero.';
  }
  if (!revisarPeriodo(datos.desde)) return 'El mes de inicio no es válido.';
  if (datos.hasta && !revisarPeriodo(datos.hasta)) return 'El mes de fin no es válido.';
  if (datos.hasta && datos.hasta < datos.desde) {
    return 'El mes de fin no puede ser anterior al de inicio.';
  }
  return null;
}

export async function crearGastoRecurrente(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('gastos.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const resultado = validar(esquemaRecurrente, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { proveedorId, ...datos } = resultado.datos;

  const problema = revisarComun(datos);
  if (problema) return fallo(problema);

  // Que no entre dos veces el mismo gasto fijo.
  //
  // No es una formalidad: un alquiler cargado por duplicado se genera dos veces
  // todos los meses y el resultado queda mal para siempre sin que nada lo
  // delate. Y hay un motivo concreto para desconfiar del formulario: la
  // confirmación en pantalla falla de vez en cuando —el dato se guarda y la
  // pantalla no acusa recibo—, así que quien lo cargó vuelve a tocar el botón
  // pensando que no entró. La defensa va acá, donde no depende de que la
  // interfaz se comporte.
  //
  // La comparación sin distinguir mayúsculas se hace en TypeScript: el `mode:
  // 'insensitive'` de Prisma sólo existe en PostgreSQL y acá se corre también
  // sobre SQLite. Los gastos fijos son unas decenas, no miles.
  const vigentes = await prisma.gastoRecurrente.findMany({
    where: { activo: true, categoria: datos.categoria },
    select: { descripcion: true },
  });
  const buscado = datos.descripcion.toLocaleLowerCase();
  const repetido = vigentes.find((r) => r.descripcion.toLocaleLowerCase() === buscado);
  if (repetido) {
    return fallo(
      `Ya hay un gasto fijo vigente que se llama «${repetido.descripcion}». Si cambió el importe, editá el que está en lugar de cargar otro.`,
    );
  }

  const creado = await prisma.gastoRecurrente.create({
    data: { ...datos, proveedorId: proveedorId || null },
  });

  await auditar(prisma, {
    accion: 'gastoRecurrente.crear',
    entidad: 'GastoRecurrente',
    entidadId: creado.id,
    resumen: `${CATEGORIAS_GASTO.etiqueta(creado.categoria)}: ${creado.descripcion} por ${creado.monto} todos los meses desde ${creado.desde}`,
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/gastos/recurrentes');
  return exito('Gasto fijo cargado.');
}

export async function actualizarGastoRecurrente(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('gastos.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const id = String(formData.get('id') ?? '');
  const antes = await prisma.gastoRecurrente.findUnique({ where: { id } });
  if (!antes) return fallo('Ese gasto fijo ya no existe.');

  const resultado = validar(esquemaRecurrente, formData);
  if (!resultado.ok) return fallo(resultado.error);
  const { proveedorId, ...datos } = resultado.datos;

  const problema = revisarComun(datos);
  if (problema) return fallo(problema);

  const despues = await prisma.gastoRecurrente.update({
    where: { id },
    data: { ...datos, proveedorId: proveedorId || null },
  });

  const cambios = compararCampos(antes, despues, [
    'categoria',
    'descripcion',
    'monto',
    'diaDePago',
    'desde',
    'hasta',
  ]);
  if (cambios) {
    await auditar(prisma, {
      accion: 'gastoRecurrente.actualizar',
      entidad: 'GastoRecurrente',
      entidadId: id,
      // Los meses ya generados no se tocan, por el mismo motivo que el precio
      // se congela en la línea del pedido.
      resumen: `Gasto fijo corregido: ${despues.descripcion}. Los meses ya generados quedan como estaban.`,
      cambios,
      actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
    });
  }

  revalidatePath('/gastos/recurrentes');
  return exito('Gasto fijo actualizado. Los meses ya generados no cambian.');
}

/**
 * Dar de baja no borra: deja de generar de acá en adelante y conserva lo ya
 * cargado. Borrarlo dejaría meses cerrados sin explicación de dónde salió el
 * gasto.
 */
export async function darDeBajaGastoRecurrente(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('gastos.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const id = String(formData.get('id') ?? '');
  const antes = await prisma.gastoRecurrente.findUnique({ where: { id } });
  if (!antes) return fallo('Ese gasto fijo ya no existe.');

  const activo = !antes.activo;
  await prisma.gastoRecurrente.update({ where: { id }, data: { activo } });

  await auditar(prisma, {
    accion: activo ? 'gastoRecurrente.reactivar' : 'gastoRecurrente.darDeBaja',
    entidad: 'GastoRecurrente',
    entidadId: id,
    resumen: `${activo ? 'Reactivado' : 'Dado de baja'}: ${antes.descripcion} por ${antes.monto}`,
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/gastos/recurrentes');
  return exito(activo ? 'Vuelve a generarse cada mes.' : 'No se vuelve a generar.');
}

/**
 * Escribe los gastos del período. Es idempotente: cada renglón lleva una clave
 * única, así que tocar el botón de nuevo no duplica nada.
 */
export async function generarGastosDelPeriodo(
  _estadoPrevio: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const guardia = await autorizar('gastos.gestionar');
  if (!guardia.ok) return guardia.respuesta;

  const periodo = String(formData.get('periodo') ?? '');
  if (!revisarPeriodo(periodo)) return fallo('Ese mes no es válido.');

  const generado = await prisma.$transaction((tx) =>
    generarPeriodo(tx, periodo, guardia.usuario.id),
  );

  if (generado.escritos === 0) {
    return exito(`${formatearPeriodo(periodo)} ya estaba generado. No se cargó nada de nuevo.`);
  }

  await auditar(prisma, {
    accion: 'gastosFijos.generar',
    entidad: 'Gasto',
    entidadId: periodo,
    resumen: `Gastos fijos de ${periodo}: ${generado.escritos} renglones por ${generado.total} (${generado.descripciones.join(', ')})`,
    actor: { id: guardia.usuario.id, nombre: guardia.usuario.nombre },
  });

  revalidatePath('/gastos/recurrentes');
  revalidatePath('/gastos');
  revalidatePath('/contabilidad');
  return exito(
    `${generado.escritos} ${generado.escritos === 1 ? 'gasto' : 'gastos'} de ${formatearPeriodo(periodo)} cargados.`,
  );
}
